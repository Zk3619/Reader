/**
 * Anime4K WebGPU 超分（参考 Anime4K-WebGPU + WebExtension 效果链）
 * Mode/Quality → Clamp+Restore(+Upscale)；源≥显示 → restore-only。
 */

import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';
import {
  resolveAnime4KWebPass,
  type Anime4KWebOptions,
} from '@/lib/media/video/enhance/anime4k-webgl';

type Anime4KModule = typeof import('anime4k-webgpu');
type Anime4KPipeline = import('anime4k-webgpu').Anime4KPipeline;

export type Anime4KEffectClass =
  | 'ClampHighlights'
  | 'CNNM'
  | 'CNNVL'
  | 'CNNUL'
  | 'CNNSoftM'
  | 'CNNSoftVL'
  | 'CNNx2M'
  | 'CNNx2VL'
  | 'CNNx2UL'
  | 'DenoiseCNNx2VL'
  | 'ModeA'
  | 'ModeB'
  | 'ModeC'
  | 'ModeAA'
  | 'ModeBB'
  | 'ModeCA';

type Tier = 'performance' | 'balanced' | 'quality';

function qualityToTier(q: Anime4KQuality): Tier {
  if (q === 'fast') return 'performance';
  if (q === 'high') return 'quality';
  return 'balanced';
}

/** 对齐 WebExtension effect-chain-templates（无 ultra） */
const CHAINS: Record<
  Exclude<Anime4KMode, 'off'>,
  Record<Tier, Anime4KEffectClass[]>
> = {
  A: {
    performance: ['ClampHighlights', 'CNNM', 'CNNx2M', 'CNNx2M'],
    balanced: ['ClampHighlights', 'CNNVL', 'CNNx2VL', 'CNNx2M'],
    quality: ['ClampHighlights', 'CNNUL', 'CNNx2UL', 'CNNx2VL'],
  },
  B: {
    performance: ['ClampHighlights', 'CNNSoftM', 'CNNx2M', 'CNNx2M'],
    balanced: ['ClampHighlights', 'CNNSoftVL', 'CNNx2VL', 'CNNx2M'],
    quality: ['ClampHighlights', 'CNNSoftVL', 'CNNx2UL', 'CNNx2VL'],
  },
  C: {
    performance: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNx2M'],
    balanced: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNx2M'],
    quality: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNx2VL'],
  },
  AA: {
    performance: ['ClampHighlights', 'CNNM', 'CNNx2M', 'CNNM', 'CNNx2M'],
    balanced: ['ClampHighlights', 'CNNVL', 'CNNx2VL', 'CNNVL', 'CNNx2M'],
    quality: ['ClampHighlights', 'CNNUL', 'CNNx2UL', 'CNNUL', 'CNNx2VL'],
  },
  BB: {
    performance: ['ClampHighlights', 'CNNSoftM', 'CNNx2M', 'CNNSoftM', 'CNNx2M'],
    balanced: ['ClampHighlights', 'CNNSoftVL', 'CNNx2VL', 'CNNSoftVL', 'CNNx2M'],
    quality: ['ClampHighlights', 'CNNSoftVL', 'CNNx2UL', 'CNNSoftVL', 'CNNx2VL'],
  },
  CA: {
    performance: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNM', 'CNNx2M'],
    balanced: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNVL', 'CNNx2M'],
    quality: ['ClampHighlights', 'DenoiseCNNx2VL', 'CNNUL', 'CNNx2VL'],
  },
};

const UPSCALE_FACTOR: Partial<Record<Anime4KEffectClass, number>> = {
  CNNx2M: 2,
  CNNx2VL: 2,
  CNNx2UL: 2,
  DenoiseCNNx2VL: 2,
};

/** 轻度放大：Clamp + restore + 单 ×2 */
function lightUpscaleChain(full: Anime4KEffectClass[]): Anime4KEffectClass[] {
  const out: Anime4KEffectClass[] = [];
  let hasRestore = false;
  let hasX2 = false;
  for (const e of full) {
    if (e === 'ClampHighlights') {
      out.push(e);
      continue;
    }
    if (UPSCALE_FACTOR[e]) {
      if (!hasX2) {
        out.push(e);
        hasX2 = true;
      }
      continue;
    }
    if (!hasRestore) {
      out.push(e);
      hasRestore = true;
    }
  }
  return out.length ? out : ['ClampHighlights', 'CNNVL'];
}

/**
 * 中度放大（大屏常见 1.1–1.85×）：restore + ×2 + 二次 restore（不跑第二段 ×2），
 * 锐度接近全链，成本远低于双 ×2。
 */
function mediumUpscaleChain(full: Anime4KEffectClass[]): Anime4KEffectClass[] {
  const out: Anime4KEffectClass[] = [];
  let restoreCount = 0;
  let hasX2 = false;
  for (const e of full) {
    if (e === 'ClampHighlights') {
      out.push(e);
      continue;
    }
    if (UPSCALE_FACTOR[e]) {
      if (!hasX2) {
        out.push(e);
        hasX2 = true;
      }
      continue;
    }
    if (restoreCount < 2) {
      out.push(e);
      restoreCount += 1;
    }
  }
  return out.length ? out : lightUpscaleChain(full);
}

export function resolveAnime4KEffectChain(
  opts: Anime4KWebOptions,
): Anime4KEffectClass[] {
  const mode = opts.forcedMode ?? opts.mode;
  if (mode === 'off') return [];
  const tier = qualityToTier(opts.quality ?? 'balanced');
  const pass = resolveAnime4KWebPass(opts);
  if (pass.pass === 'restore-only') {
    // 源已够显示分辨率：用更强 restore，避免「几乎看不出超分」
    if (tier === 'performance') return ['ClampHighlights', 'CNNVL'];
    if (tier === 'quality') return ['ClampHighlights', 'CNNUL', 'CNNM'];
    return ['ClampHighlights', 'CNNUL'];
  }
  const full = CHAINS[mode][tier];
  const ratio =
    opts.displayHeight > 0 && opts.sourceHeight > 0
      ? opts.displayHeight / opts.sourceHeight
      : 2;
  const q = opts.quality ?? 'balanced';
  // high：尽量全链；balanced：中链；fast：轻链
  if (ratio < 1.85) {
    if (q === 'high') return full;
    if (q === 'fast') return lightUpscaleChain(full);
    return mediumUpscaleChain(full);
  }
  return full;
}

const FS_QUAD = `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
}
@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0), vec2( 1.0, -1.0), vec2(-1.0, -1.0),
    vec2( 1.0,  1.0), vec2(-1.0, -1.0), vec2(-1.0,  1.0),
  );
  const uv = array(
    vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0),
    vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 0.0),
  );
  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}`;

const FS_SAMPLE = `
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;
@fragment
fn main(@location(0) fragUV : vec2f) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(myTexture, mySampler, fragUV);
}`;

export type Anime4KWebGpuRenderer = {
  drawSource: (source: CanvasImageSource, srcW: number, srcH: number) => Promise<number>;
  setOptions: (opts: Anime4KWebOptions) => Promise<void>;
  getLastFrameMs: () => number;
  destroy: () => void;
  /** 是否真实 CNN 链（非直通） */
  isActive: () => boolean;
};

export async function createAnime4KWebGpuRenderer(
  canvas: HTMLCanvasElement,
): Promise<Anime4KWebGpuRenderer | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter(
    // Windows Chromium 忽略 powerPreference 且会打 warning；与 Anime4K-WebExtension 一致不传
    typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
      ? undefined
      : { powerPreference: 'high-performance' },
  );
  if (!adapter) return null;

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  });

  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    return null;
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  let mod: Anime4KModule;
  try {
    mod = await import('anime4k-webgpu');
  } catch {
    device.destroy();
    return null;
  }

  let opts: Anime4KWebOptions = {
    mode: 'off',
    quality: 'balanced',
    sourceHeight: 0,
    displayHeight: 0,
  };
  let lastMs = 0;
  let pipelines: Anime4KPipeline[] = [];
  let videoFrameTexture: GPUTexture | null = null;
  let texW = 0;
  let texH = 0;
  let chainKey = '';
  let destroyed = false;

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    ],
  });

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
    vertex: {
      module: device.createShaderModule({ code: FS_QUAD }),
      entryPoint: 'vert_main',
    },
    fragment: {
      module: device.createShaderModule({ code: FS_SAMPLE }),
      entryPoint: 'main',
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const ensureInputTexture = (w: number, h: number) => {
    if (videoFrameTexture && texW === w && texH === h) return;
    videoFrameTexture?.destroy();
    videoFrameTexture = device.createTexture({
      size: [w, h, 1],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    texW = w;
    texH = h;
  };

  const rebuildPipelines = async (srcW: number, srcH: number) => {
    const effects = resolveAnime4KEffectChain({
      ...opts,
      sourceHeight: srcH,
      displayHeight: opts.displayHeight || srcH,
    });
    const key = `${effects.join('+')}|${srcW}x${srcH}|${opts.displayHeight}`;
    if (key === chainKey && pipelines.length) return;
    chainKey = key;

    await device.queue.onSubmittedWorkDone().catch(() => {});
    for (const p of pipelines) {
      try {
        (p as { destroy?: () => void }).destroy?.();
      } catch {
        /* */
      }
    }
    pipelines = [];
    if (!effects.length || !videoFrameTexture) return;

    let current = videoFrameTexture;
    let curW = srcW;
    let curH = srcH;
    const target = {
      width: Math.max(1, Math.round(opts.displayHeight ? (srcW * opts.displayHeight) / srcH : srcW * 2)),
      height: Math.max(1, opts.displayHeight || srcH * 2),
    };
    // 显示尺寸已知时按片源锁定宽高（displayWidth），避免推理源比例漂移
    if (opts.displayHeight > 0) {
      target.height = opts.displayHeight;
      target.width =
        opts.displayWidth && opts.displayWidth > 0
          ? opts.displayWidth
          : Math.max(1, Math.round((srcW / srcH) * opts.displayHeight));
    }

    const upscaleFactors = effects.map((e) => UPSCALE_FACTOR[e] ?? 1);
    const remaining = upscaleFactors.map((_, i) =>
      upscaleFactors.slice(i + 1).reduce((a, b) => a * b, 1),
    );

    for (let i = 0; i < effects.length; i++) {
      const name = effects[i]!;
      const EffectClass = (mod as unknown as Record<string, new (d: unknown) => Anime4KPipeline>)[
        name
      ];
      if (!EffectClass) continue;
      const pipeline = new EffectClass({
        device,
        inputTexture: current,
        nativeDimensions: { width: curW, height: curH },
        targetDimensions: target,
      });
      pipelines.push(pipeline);
      current = pipeline.getOutputTexture();

      const uf = UPSCALE_FACTOR[name];
      if (uf) {
        curW *= uf;
        curH *= uf;
        const rem = remaining[i] ?? 1;
        if (rem > 1 && mod.Downscale) {
          if (
            target.width > 1.2 * (curW / uf) &&
            target.height > 1.2 * (curH / uf) &&
            target.width < 2.0 * (curW / uf) * rem &&
            target.height < 2.0 * (curH / uf) * rem
          ) {
            // WebExtension：多级 ×2 后插入 Downscale；此处简化跳过中间 Downscale，
            // 依赖后续 Upscale 输出再 blit 缩放
          }
        }
      }
    }
  };

  const blitToCanvas = (
    texture: GPUTexture,
    target?: { w: number; h: number },
  ) => {
    const outW = target?.w ?? texture.width;
    const outH = target?.h ?? texture.height;
    if (canvas.width !== outW || canvas.height !== outH) {
      canvas.width = outW;
      canvas.height = outH;
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });
    }
    const bindGroup = device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  return {
    isActive: () => pipelines.length > 0,
    getLastFrameMs: () => lastMs,
    destroy() {
      destroyed = true;
      for (const p of pipelines) {
        try {
          (p as { destroy?: () => void }).destroy?.();
        } catch {
          /* */
        }
      }
      pipelines = [];
      videoFrameTexture?.destroy();
      device.destroy();
    },
    async setOptions(next) {
      const prev = opts;
      opts = { ...opts, ...next };
      const invalidate =
        prev.mode !== opts.mode ||
        prev.forcedMode !== opts.forcedMode ||
        prev.quality !== opts.quality ||
        prev.displayHeight !== opts.displayHeight ||
        prev.displayWidth !== opts.displayWidth ||
        prev.sourceHeight !== opts.sourceHeight;
      if (invalidate) chainKey = '';
    },
    async drawSource(source, srcW, srcH) {
      if (destroyed || srcW <= 0 || srcH <= 0) return 0;
      const t0 = performance.now();
      ensureInputTexture(srcW, srcH);
      device.queue.copyExternalImageToTexture(
        { source: source as GPUCopyExternalImageSource },
        { texture: videoFrameTexture! },
        [srcW, srcH],
      );

      const resolveOut = (fallbackW: number, fallbackH: number) => {
        const outH = opts.displayHeight > 0 ? opts.displayHeight : fallbackH;
        const outW =
          opts.displayWidth && opts.displayWidth > 0
            ? opts.displayWidth
            : opts.displayHeight > 0
              ? Math.max(1, Math.round((fallbackW / Math.max(1, fallbackH)) * outH))
              : fallbackW;
        return { outW, outH };
      };

      const mode = opts.forcedMode ?? opts.mode;
      if (mode === 'off') {
        const { outW, outH } = resolveOut(srcW, srcH);
        blitToCanvas(videoFrameTexture!, { w: outW, h: outH });
        lastMs = performance.now() - t0;
        return lastMs;
      }

      await rebuildPipelines(srcW, srcH);
      if (!pipelines.length) {
        const { outW, outH } = resolveOut(srcW, srcH);
        blitToCanvas(videoFrameTexture!, { w: outW, h: outH });
        lastMs = performance.now() - t0;
        return lastMs;
      }

      const encoder = device.createCommandEncoder();
      for (const p of pipelines) p.pass(encoder);
      device.queue.submit([encoder.finish()]);

      const last = pipelines[pipelines.length - 1]!;
      const outTex = last.getOutputTexture();
      const { outW, outH } = resolveOut(outTex.width, outTex.height);
      blitToCanvas(outTex, { w: outW, h: outH });
      lastMs = performance.now() - t0;
      return lastMs;
    },
  };
}
