/**
 * vs-mlrt RIFE ONNX 实推理（Web / ORT）
 *
 * rife_v2：input [N,7,H,W] = RGB_a(3)+RGB_b(3)+t_mask(1)；内部 padding
 * rife v1：input [N,11,H,W] = 上式 + meshgrid(h,v) + multiplier(h,w)
 *
 * @see AmusementClub/vs-mlrt RIFEMerge
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type { PipelineEpoch } from '@/lib/media/video/enhance/media-clock';

export type RifeImplVersion = 1 | 2;

export type RifeSessionInfo = {
  impl: RifeImplVersion;
  inputName: string;
  outputName: string;
  modelPath: string;
  /** 通道数 7 或 11 */
  channels: number;
};

type OrtModule = typeof import('onnxruntime-web/webgpu');
type OrtSession = InstanceType<OrtModule['InferenceSession']>;

let ortMod: OrtModule | null = null;
let session: OrtSession | null = null;
let sessionInfo: RifeSessionInfo | null = null;
let initPromise: Promise<RifeSessionInfo | null> | null = null;
/** 初始化失败后不再每帧重试（避免 console 风暴）；release 后可再试 */
let initFailed = false;

function configureOrtWasmPaths(ort: OrtModule): void {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = `${base.endsWith('/') ? base : `${base}/`}ort/`;
  ort.env.wasm.wasmPaths = prefix;
  ort.env.wasm.numThreads = 1;
  // 代理 worker 在部分 Vite/Tauri 路径下同样会踩 SPA HTML
  (ort.env.wasm as { proxy?: boolean }).proxy = false;
  // 压掉 VerifyEachNodeIsAssignedToAnEp 等 [W:] 刷屏；真错误仍可见
  (ort.env as { logLevel?: string }).logLevel = 'error';
}

const MODEL_CANDIDATES: { rel: string[]; impl: RifeImplVersion }[] = [
  { rel: ['resources', 'rife', 'web', 'rife_v2', 'rife_v4.9.onnx'], impl: 2 },
  { rel: ['rife', 'web', 'rife_v2', 'rife_v4.9.onnx'], impl: 2 },
  { rel: ['resources', 'rife', 'web', 'rife', 'rife_v4.9.onnx'], impl: 1 },
  { rel: ['rife', 'web', 'rife', 'rife_v4.9.onnx'], impl: 1 },
];

async function pathExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    return await exists(path);
  } catch {
    return false;
  }
}

/** 解析捆绑/开发态模型绝对路径 */
export async function resolveRifeOnnxPath(): Promise<{
  path: string;
  impl: RifeImplVersion;
} | null> {
  try {
    const { resourceDir, join } = await import('@tauri-apps/api/path');
    const base = await resourceDir();
    for (const c of MODEL_CANDIDATES) {
      const p = await join(base, ...c.rel);
      if (await pathExists(p)) return { path: p, impl: c.impl };
    }
  } catch {
    /* 非 Tauri */
  }

  // Vite 开发：相对仓库 src-tauri
  for (const c of MODEL_CANDIDATES) {
    const rel = `src-tauri/${c.rel.join('/')}`;
    try {
      const res = await fetch(`/${rel}`);
      if (res.ok) {
        // 开发态走 URL，impl 仍返回
        return { path: `/${rel}`, impl: c.impl };
      }
    } catch {
      /* */
    }
  }
  return null;
}

async function loadModelBytes(path: string): Promise<Uint8Array> {
  if (path.startsWith('/') || path.startsWith('http')) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`fetch model ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const data = await readFile(path);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function padToMultiple(n: number, m: number): number {
  return Math.ceil(n / m) * m;
}

/** RGBA ImageData → NCHW float32 RGB [0,1]，可 pad */
export function imageDataToNchwRgb(
  img: ImageData,
  padH: number,
  padW: number,
): Float32Array {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(3 * padH * padW);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * padW + x;
      out[0 * padH * padW + di] = data[si]! / 255;
      out[1 * padH * padW + di] = data[si + 1]! / 255;
      out[2 * padH * padW + di] = data[si + 2]! / 255;
    }
  }
  return out;
}

/** 填满单通道常数 / mesh */
function fillPlane(
  out: Float32Array,
  planeOffset: number,
  padH: number,
  padW: number,
  fn: (y: number, x: number) => number,
): void {
  const base = planeOffset * padH * padW;
  for (let y = 0; y < padH; y++) {
    for (let x = 0; x < padW; x++) {
      out[base + y * padW + x] = fn(y, x);
    }
  }
}

/**
 * 按 vs-mlrt 约定拼装输入张量
 * @param t 时间步 (0,1)
 */
export function packRifeInput(opts: {
  prev: ImageData;
  next: ImageData;
  t: number;
  impl: RifeImplVersion;
}): { data: Float32Array; dims: number[]; cropH: number; cropW: number } {
  const h = opts.prev.height;
  const w = opts.prev.width;
  if (opts.next.width !== w || opts.next.height !== h) {
    throw new Error('RIFE frame size mismatch');
  }
  const multiple = opts.impl === 1 ? 32 : 1;
  const padH = padToMultiple(h, multiple);
  const padW = padToMultiple(w, multiple);
  const ch = opts.impl === 2 ? 7 : 11;
  const data = new Float32Array(ch * padH * padW);
  const plane = padH * padW;

  const a = imageDataToNchwRgb(opts.prev, padH, padW);
  const b = imageDataToNchwRgb(opts.next, padH, padW);
  data.set(a, 0);
  data.set(b, 3 * plane);

  const t = Math.min(1, Math.max(0, opts.t));
  fillPlane(data, 6, padH, padW, () => t);

  if (opts.impl === 1) {
    const denomW = Math.max(1, padW - 1);
    const denomH = Math.max(1, padH - 1);
    fillPlane(data, 7, padH, padW, (_y, x) => (2 * x) / denomW - 1);
    fillPlane(data, 8, padH, padW, (y) => (2 * y) / denomH - 1);
    fillPlane(data, 9, padH, padW, () => 2 / denomW);
    fillPlane(data, 10, padH, padW, () => 2 / denomH);
  }

  return { data, dims: [1, ch, padH, padW], cropH: h, cropW: w };
}

export function nchwRgbToImageData(
  data: Float32Array,
  dims: readonly number[],
  cropH: number,
  cropW: number,
): ImageData {
  // dims: [N,C,H,W]
  const fullH = dims[2] ?? cropH;
  const fullW = dims[3] ?? cropW;
  const plane = fullH * fullW;
  const out = new ImageData(cropW, cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const si = y * fullW + x;
      const di = (y * cropW + x) * 4;
      const r = Math.min(255, Math.max(0, Math.round((data[0 * plane + si] ?? 0) * 255)));
      const g = Math.min(255, Math.max(0, Math.round((data[1 * plane + si] ?? 0) * 255)));
      const b = Math.min(255, Math.max(0, Math.round((data[2 * plane + si] ?? 0) * 255)));
      out.data[di] = r;
      out.data[di + 1] = g;
      out.data[di + 2] = b;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

/** 懒加载 ORT session；失败返回 null（失败缓存，不每帧重试） */
export async function ensureRifeSession(): Promise<RifeSessionInfo | null> {
  if (sessionInfo && session) return sessionInfo;
  if (initFailed) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const resolved = await resolveRifeOnnxPath();
    if (!resolved) {
      initFailed = true;
      return null;
    }

    ortMod = await import('onnxruntime-web/webgpu');
    configureOrtWasmPaths(ortMod);

    const bytes = await loadModelBytes(resolved.path);
    // 优先 WebGPU EP；失败再试 wasm（需 /ort/*.wasm 正确 MIME）
    try {
      session = await ortMod.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
      });
    } catch (webgpuErr) {
      console.warn('[rife] webgpu EP failed, trying wasm', webgpuErr);
      session = await ortMod.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
      });
    }

    const inputName = session.inputNames[0] ?? 'input';
    const outputName = session.outputNames[0] ?? 'output';
    sessionInfo = {
      impl: resolved.impl,
      inputName,
      outputName,
      modelPath: resolved.path,
      channels: resolved.impl === 2 ? 7 : 11,
    };
    initFailed = false;
    return sessionInfo;
  })().catch((e) => {
    console.warn('[rife] session init failed', e);
    session = null;
    sessionInfo = null;
    initFailed = true;
    // 保留 initPromise 为已结算的 null，防止每帧重新 create
    return null;
  });

  return initPromise;
}

export function isRifeSessionInitFailed(): boolean {
  return initFailed;
}

export function getRifeSessionInfo(): RifeSessionInfo | null {
  return sessionInfo;
}

export async function releaseRifeSession(): Promise<void> {
  try {
    await session?.release();
  } catch {
    /* */
  }
  session = null;
  sessionInfo = null;
  initPromise = null;
  initFailed = false;
}

/**
 * 双帧插值；带 epoch 守卫。返回 ImageBitmap 或 null。
 */
export async function runRifeInterpolate(opts: {
  prev: ImageData;
  next: ImageData;
  t: number;
  epoch: number;
  pipelineEpoch: PipelineEpoch;
}): Promise<{ bitmap: ImageBitmap; ms: number } | null> {
  const info = await ensureRifeSession();
  if (!info || !session || !ortMod) return null;
  if (!opts.pipelineEpoch.isCurrent(opts.epoch)) return null;

  const t0 = performance.now();
  const packed = packRifeInput({
    prev: opts.prev,
    next: opts.next,
    t: opts.t,
    impl: info.impl,
  });

  const input = new ortMod.Tensor('float32', packed.data, packed.dims);
  const feeds: Record<string, InstanceType<OrtModule['Tensor']>> = {
    [info.inputName]: input,
  };
  const results = await session.run(feeds);
  if (!opts.pipelineEpoch.isCurrent(opts.epoch)) {
    return null;
  }

  const out = results[info.outputName];
  if (!out) return null;
  const outData = out.data as Float32Array;
  const outDims = out.dims as number[];
  const img = nchwRgbToImageData(outData, outDims, packed.cropH, packed.cropW);
  const bitmap = await createImageBitmap(img);
  return { bitmap, ms: performance.now() - t0 };
}

/** 将 CanvasImageSource 采成指定最大高度的 ImageData（用于 RIFE 推理降载） */
export function captureImageData(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxHeight: number,
): ImageData {
  let w = srcW;
  let h = srcH;
  if (h > maxHeight && maxHeight > 0) {
    const s = maxHeight / h;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
