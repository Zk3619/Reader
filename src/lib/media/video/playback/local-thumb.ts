/**
 * 本地 / proxy 直链 seek 缩略图（内置，不依赖 mpv / libmpv）。
 *
 * 跟手策略（避免正片卡顿）：
 *   滑动中：只读内存缓存 / 靠近播放头时从正片抓帧；取消一切二次 video 抽帧
 *   停手后：才允许 Range seek 抽一帧写入缓存
 *   后台：SpriteStore 灌帧；悬停期间暂停
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';

/** 落盘 / 灌帧间隔 */
export const SEEK_THUMB_STORE_INTERVAL_SEC = 5;
/** 悬停内存缓存粒度（更细 → 跟手更好） */
const LIVE_INTERVAL_SEC = 1;
const TILE_W = 160;
const TILE_H = 90;

type MemEntry = {
  /** 仅单帧 dataURL，禁止存雪碧图整图 URL */
  url?: string;
  canvas?: HTMLCanvasElement;
  at: number;
};

const memCache = new Map<string, MemEntry>();
const persistTried = new Set<string>();
const seedAbortByKey = new Map<string, AbortController>();
const resolvedSrcCache = new Map<string, string>();
/** 正在从 SpriteStore 裁切灌入 mem 的槽，去重 */
const hydrateInflight = new Map<string, Promise<MemEntry | null>>();

/** >0 表示进度条悬停中：灌帧让路 */
let hoverDepth = 0;

function liveBucket(sec: number): number {
  return Math.floor(Math.max(0, sec) / LIVE_INTERVAL_SEC) * LIVE_INTERVAL_SEC;
}

function storeBucket(sec: number): number {
  return (
    Math.floor(Math.max(0, sec) / SEEK_THUMB_STORE_INTERVAL_SEC) *
    SEEK_THUMB_STORE_INTERVAL_SEC
  );
}

function memKey(spriteKey: string, sec: number): string {
  return `${spriteKey}#${liveBucket(sec)}`;
}

function isLocalPath(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u) || /^blob:/i.test(u) || /^data:/i.test(u)) return false;
  if (u.startsWith('file://')) return true;
  return /^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('/') || u.startsWith('\\\\');
}

export function isProxySeekThumbSource(url: string): boolean {
  const u = url.trim();
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u)) return false;
  if (/m3u8|mpegurl|[?&]do=m3u8\b/i.test(u)) return false;
  return true;
}

export function isLocalSeekThumbSource(url: string): boolean {
  return isLocalPath(url) || isProxySeekThumbSource(url);
}

export function beginSeekThumbHover(): void {
  hoverDepth += 1;
}

export function endSeekThumbHover(): void {
  hoverDepth = Math.max(0, hoverDepth - 1);
}

function isHovering(): boolean {
  return hoverDepth > 0;
}

async function resolvePlayableSrc(path: string): Promise<string> {
  const p = path.trim();
  if (!p) return p;
  const hit = resolvedSrcCache.get(p);
  if (hit) return hit;
  let out = p;
  if (/^https?:\/\//i.test(p) || p.startsWith('blob:')) {
    out = p;
  } else if (!isTauri()) {
    out = p.startsWith('file://') ? p : convertFileSrc(p);
  } else {
    try {
      const { resolveProxyBaseUrl, wrapLocalFileThroughProxy } = await import(
        '@/lib/media/tv/proxy/client'
      );
      const base = await resolveProxyBaseUrl();
      out = wrapLocalFileThroughProxy(p.replace(/^file:\/\//i, ''), base);
    } catch {
      out = convertFileSrc(p.replace(/^file:\/\//i, ''));
    }
  }
  resolvedSrcCache.set(p, out);
  return out;
}

async function waitVideoEvent(
  video: HTMLVideoElement,
  type: 'loadeddata' | 'seeked' | 'loadedmetadata',
  ms: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const onDone = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', onLoad);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('seeked', onSeek);
      video.removeEventListener('error', onErr);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onLoad = () => type === 'loadeddata' && onDone(true);
    const onMeta = () => type === 'loadedmetadata' && onDone(true);
    const onSeek = () => type === 'seeked' && onDone(true);
    const onErr = () => onDone(false);
    const timer = window.setTimeout(() => onDone(false), ms);
    video.addEventListener('loadeddata', onLoad);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('seeked', onSeek);
    video.addEventListener('error', onErr);
    if (type === 'loadeddata' && video.readyState >= 2) onDone(true);
    if (type === 'loadedmetadata' && video.readyState >= 1) onDone(true);
  });
}

/* —— 热路径单例 —— */
let dispVideo: HTMLVideoElement | null = null;
let dispSrc = '';
let dispCors = false;
let dispGen = 0;
/** 固定画布：悬停直绘，避免每帧 createElement / toDataURL */
let paintCanvas: HTMLCanvasElement | null = null;

function ensurePaintCanvas(): HTMLCanvasElement {
  if (!paintCanvas) {
    paintCanvas = document.createElement('canvas');
    paintCanvas.width = TILE_W;
    paintCanvas.height = TILE_H;
  }
  return paintCanvas;
}

function ensureDispVideo(): HTMLVideoElement {
  if (!dispVideo) {
    dispVideo = document.createElement('video');
    dispVideo.muted = true;
    dispVideo.preload = 'auto';
    dispVideo.playsInline = true;
    // 降低解码成本：不必播声轨
    (dispVideo as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
      true;
    dispVideo.style.cssText =
      'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(dispVideo);
  }
  return dispVideo;
}

function drawCover(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
  if (canvas.width !== TILE_W) canvas.width = TILE_W;
  if (canvas.height !== TILE_H) canvas.height = TILE_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx || !video.videoWidth) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight || 1;
  const scale = Math.max(TILE_W / vw, TILE_H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (TILE_W - dw) / 2, (TILE_H - dh) / 2, dw, dh);
}

function bindDispSrcSync(src: string, useCors: boolean): HTMLVideoElement {
  const video = ensureDispVideo();
  if (dispSrc !== src || dispCors !== useCors) {
    dispSrc = src;
    dispCors = useCors;
    if (useCors) video.crossOrigin = 'anonymous';
    else video.removeAttribute('crossorigin');
    video.src = src;
  }
  return video;
}

export function warmupSeekThumbSource(path: string): void {
  if (!path.trim()) return;
  void (async () => {
    const src = await resolvePlayableSrc(path);
    const useCors = isProxySeekThumbSource(src) || /[?&]do=file\b/i.test(src);
    bindDispSrcSync(src, useCors);
    void waitVideoEvent(ensureDispVideo(), 'loadedmetadata', 15_000);
  })();
}

export type LocalSeekThumbResult = {
  url?: string;
  canvas?: HTMLCanvasElement;
  x?: number;
  y?: number;
  sprite?: boolean;
};

export type LocalSeekThumbOptions = {
  spriteKey?: string;
  /** 热路径：跳过 SpriteStore 读盘 */
  hot?: boolean;
};

/** 就近内存帧（±12s 内），滑动时只靠缓存跟手 */
function nearestMem(spriteKey: string, sec: number): LocalSeekThumbResult | null {
  const target = liveBucket(sec);
  let best: MemEntry | null = null;
  let bestDist = Infinity;
  for (let d = 0; d <= 12; d++) {
    for (const sign of d === 0 ? [0] : [-1, 1]) {
      const t = target + sign * d * LIVE_INTERVAL_SEC;
      if (t < 0) continue;
      const e = memCache.get(memKey(spriteKey, t));
      if (!e) continue;
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    if (best && bestDist === 0) break;
  }
  if (!best) return null;
  return entryToResult(best);
}

function entryToResult(e: MemEntry): LocalSeekThumbResult | null {
  // 只返回单帧：dataURL 或已裁切 canvas
  if (e.canvas) return { canvas: e.canvas };
  if (e.url?.startsWith('data:image')) return { url: e.url };
  return null;
}

function snapshotCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_W;
  c.height = TILE_H;
  const ctx = c.getContext('2d', { alpha: false });
  if (ctx) ctx.drawImage(src, 0, 0);
  return c;
}

/** 内存只存单帧；雪碧图整图 URL 一律丢弃 */
function putMem(spriteKey: string, sec: number, r: LocalSeekThumbResult): void {
  const key = memKey(spriteKey, sec);
  const entry: MemEntry = { at: Date.now() };
  if (r.canvas) {
    entry.canvas = snapshotCanvas(r.canvas);
  } else if (r.url?.startsWith('data:image')) {
    entry.url = r.url;
  } else {
    // 拒绝把 sprite sheet / asset URL 当单帧缓存
    return;
  }
  memCache.set(key, entry);
  if (memCache.size > 400) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
}

async function seekAndPaint(
  path: string,
  sec: number,
  myGen: number,
): Promise<LocalSeekThumbResult | null> {
  const src = await resolvePlayableSrc(path);
  if (myGen !== dispGen) return null;
  const useCors = isProxySeekThumbSource(src) || /[?&]do=file\b/i.test(src);
  const video = bindDispSrcSync(src, useCors);

  // 只等 metadata 即可 seek（大文件等 loadeddata 太慢）
  if (video.readyState < 1) {
    const ok = await waitVideoEvent(video, 'loadedmetadata', 8_000);
    if (!ok || myGen !== dispGen) return null;
  }

  const t = Math.min(Math.max(0, sec), Math.max(0, (video.duration || sec) - 0.05));
  try {
    if (typeof (video as HTMLVideoElement & { fastSeek?: (n: number) => void }).fastSeek === 'function') {
      (video as HTMLVideoElement & { fastSeek: (n: number) => void }).fastSeek(t);
    } else {
      video.currentTime = t;
    }
  } catch {
    return null;
  }

  // 短超时：过期则放弃，让更新的悬停请求接手
  const seekOk = await waitVideoEvent(video, 'seeked', 2_500);
  if (!seekOk || myGen !== dispGen) return null;
  if (!video.videoWidth) return null;

  // 等一帧解码
  await new Promise<void>((r) => {
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(() => r());
      window.setTimeout(() => r(), 80);
    } else {
      requestAnimationFrame(() => r());
    }
  });
  if (myGen !== dispGen) return null;

  const canvas = ensurePaintCanvas();
  drawCover(video, canvas);

  // 热路径绝不 toDataURL（大图编码会卡顿）；后台 idle 再持久化
  return { canvas };
}

type LiveReq = {
  path: string;
  sec: number;
  spriteKey: string;
  onFrame: (r: LocalSeekThumbResult) => void;
};

let pendingLive: LiveReq | null = null;
let liveRunning = false;

/** 取消进行中的抽帧（滑动中调用，立刻让出解码器给正片） */
export function cancelSeekThumbDecode(): void {
  dispGen += 1;
  pendingLive = null;
}

async function pumpLive(): Promise<void> {
  if (liveRunning) return;
  liveRunning = true;
  try {
    while (pendingLive) {
      const req = pendingLive;
      pendingLive = null;
      const bucket = liveBucket(req.sec);
      const exact = memCache.get(memKey(req.spriteKey, bucket));
      const exactR = exact ? entryToResult(exact) : null;
      if (exactR) {
        req.onFrame(exactR);
        continue;
      }

      // 先试盘上雪碧图裁格，避免空白等网络 seek
      const fromStore = await hydrateSeekThumbFromStore(req.spriteKey, req.sec);
      if (fromStore && !pendingLive) {
        req.onFrame(fromStore);
        continue;
      }
      if (pendingLive) continue;

      const myGen = ++dispGen;
      const painted = await seekAndPaint(req.path, req.sec, myGen);
      if (!painted || myGen !== dispGen) continue;
      putMem(req.spriteKey, req.sec, painted);
      // await 之后可能有新的悬停请求；显式断言避开 CFA 把 pendingLive 收窄成 null
      const live = pendingLive as LiveReq | null;
      if (!live || Math.abs(liveBucket(live.sec) - bucket) <= 1) {
        req.onFrame(painted);
      }
      void queuePersist(req.spriteKey, req.sec, painted);
    }
  } finally {
    liveRunning = false;
    if (pendingLive) void pumpLive();
  }
}

/** 同步读内存缓存（不触发解码）；仅单帧 */
export function peekSeekThumbCached(
  spriteKey: string,
  sec: number,
): LocalSeekThumbResult | null {
  const key = (spriteKey || '').trim();
  if (!key) return null;
  const exact = memCache.get(memKey(key, sec));
  if (exact) {
    const r = entryToResult(exact);
    if (r) return r;
  }
  return nearestMem(key, sec);
}

/**
 * 异步从 SpriteStore 裁单格灌入 mem（不返回整张雪碧图）。
 * 悬停时可调用以尽快补洞，完成后用 peek 取帧。
 */
export function hydrateSeekThumbFromStore(
  spriteKey: string,
  sec: number,
): Promise<LocalSeekThumbResult | null> {
  const key = (spriteKey || '').trim();
  if (!key || !isTauri()) return Promise.resolve(null);
  const mk = memKey(key, sec);
  const hit = memCache.get(mk);
  if (hit) {
    const r = entryToResult(hit);
    if (r) return Promise.resolve(r);
  }
  const existing = hydrateInflight.get(mk);
  if (existing) {
    return existing.then((e) => (e ? entryToResult(e) : null));
  }

  const task = (async (): Promise<MemEntry | null> => {
    try {
      const { getSeekThumbTile } = await import('@/lib/media/video/playback/sprite-store');
      const tile = await getSeekThumbTile(key, sec);
      if (!tile) return null;
      putMem(key, sec, tile);
      return memCache.get(mk) ?? null;
    } catch {
      return null;
    } finally {
      hydrateInflight.delete(mk);
    }
  })();
  hydrateInflight.set(mk, task);
  return task.then((e) => (e ? entryToResult(e) : null));
}

/**
 * 从正在播放的正片 video 抓一帧（仅当悬停点靠近播放头）。
 * 零额外 Range，不抢解码器。
 */
export function captureSeekThumbFromPlayingVideo(
  video: HTMLVideoElement | null | undefined,
  hoverSec: number,
  spriteKey: string,
  maxDeltaSec = 2,
): LocalSeekThumbResult | null {
  if (!video || !video.videoWidth) return null;
  if (!Number.isFinite(video.currentTime)) return null;
  if (Math.abs(video.currentTime - hoverSec) > maxDeltaSec) return null;
  const canvas = ensurePaintCanvas();
  try {
    drawCover(video, canvas);
  } catch {
    return null;
  }
  const snap = snapshotCanvas(canvas);
  const r = { canvas: snap };
  putMem(spriteKey, hoverSec, r);
  return r;
}

/**
 * 仅在「停手」后调用：发起一次 Range 抽帧写入缓存。
 * 滑动过程中请用 peek + cancelSeekThumbDecode，不要调这个。
 */
export function requestSeekThumbDecode(opts: {
  path: string;
  sec: number;
  spriteKey?: string;
  onFrame: (r: LocalSeekThumbResult) => void;
}): void {
  const spriteKey = opts.spriteKey?.trim() || opts.path;
  const exact = peekSeekThumbCached(spriteKey, opts.sec);
  if (exact) {
    opts.onFrame(exact);
    // 精确桶已有单帧则不必再 seek
    if (memCache.has(memKey(spriteKey, opts.sec))) return;
  }
  pendingLive = {
    path: opts.path,
    sec: opts.sec,
    spriteKey,
    onFrame: opts.onFrame,
  };
  void pumpLive();
}

/** @deprecated 兼容旧名 → 停手抽帧 */
export function requestSeekThumbLive(opts: {
  path: string;
  sec: number;
  spriteKey?: string;
  onFrame: (r: LocalSeekThumbResult) => void;
}): void {
  requestSeekThumbDecode(opts);
}

async function queuePersist(
  spriteKey: string,
  sec: number,
  result: LocalSeekThumbResult,
): Promise<void> {
  if (!isTauri() || isHovering()) return;
  const pk = `${spriteKey}#${storeBucket(sec)}`;
  if (persistTried.has(pk)) return;
  // 从 canvas 导出仅在非悬停时做
  const canvas = result.canvas || (result.url ? null : null);
  if (!canvas && !result.url?.startsWith('data:image')) return;
  persistTried.add(pk);
  try {
    let dataUrl = result.url;
    if (!dataUrl?.startsWith('data:image') && canvas) {
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        return;
      }
    }
    if (!dataUrl?.startsWith('data:image')) return;
    const { putSeekThumbFrame } = await import('@/lib/media/video/playback/sprite-store');
    await putSeekThumbFrame(spriteKey, sec, dataUrl);
    // 回填 mem 为 url，后续免 canvas
    putMem(spriteKey, sec, { url: dataUrl });
  } catch {
    persistTried.delete(pk);
  }
}

/** 兼容旧 API：非热路径可读盘 */
export async function getLocalSeekThumbnailDetailed(
  path: string,
  sec: number,
  opts?: LocalSeekThumbOptions,
): Promise<LocalSeekThumbResult | null> {
  const spriteKey = opts?.spriteKey?.trim() || path;
  const cached = peekSeekThumbCached(spriteKey, sec);
  if (cached && memCache.has(memKey(spriteKey, sec))) return cached;
  if (cached && opts?.hot) return cached;

  if (!opts?.hot && isTauri()) {
    const tile = await hydrateSeekThumbFromStore(spriteKey, sec);
    if (tile) return tile;
  }

  return new Promise((resolve) => {
    let done = false;
    requestSeekThumbDecode({
      path,
      sec,
      spriteKey,
      onFrame: (r) => {
        if (done) return;
        if (r.canvas || r.url?.startsWith('data:image')) {
          done = true;
          resolve(r);
        }
      },
    });
    window.setTimeout(() => {
      if (!done) {
        done = true;
        resolve(peekSeekThumbCached(spriteKey, sec));
      }
    }, 3_000);
  });
}

export async function getLocalSeekThumbnail(
  path: string,
  sec: number,
  opts?: LocalSeekThumbOptions,
): Promise<string | null> {
  const r = await getLocalSeekThumbnailDetailed(path, sec, opts);
  return r?.url ?? null;
}

export function seedSeekThumbsFromLocalFile(opts: {
  localPath: string;
  spriteKey: string;
  durationSec?: number;
}): () => void {
  const key = opts.spriteKey.trim() || opts.localPath;
  seedAbortByKey.get(key)?.abort();
  const ac = new AbortController();
  seedAbortByKey.set(key, ac);

  void (async () => {
    if (!isTauri()) return;
    const src = await resolvePlayableSrc(opts.localPath);
    if (ac.signal.aborted) return;

    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.cssText =
      'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(video);
    video.src = src;

    const waitWhileHover = async () => {
      while (isHovering() && !ac.signal.aborted) {
        await new Promise<void>((r) => window.setTimeout(r, 200));
      }
    };

    try {
      const metaOk = await waitVideoEvent(video, 'loadedmetadata', 20_000);
      if (!metaOk || ac.signal.aborted) return;
      const dur =
        (opts.durationSec && opts.durationSec > 0
          ? opts.durationSec
          : video.duration) || 0;
      if (!(dur > 0) || !Number.isFinite(dur)) return;

      const { putSeekThumbFrame } = await import(
        '@/lib/media/video/playback/sprite-store'
      );
      const canvas = document.createElement('canvas');
      let gen = 0;

      for (let sec = 0; sec < dur; sec += SEEK_THUMB_STORE_INTERVAL_SEC) {
        if (ac.signal.aborted) break;
        await waitWhileHover();
        if (ac.signal.aborted) break;
        try {
          const { getSeekThumbTile } = await import(
            '@/lib/media/video/playback/sprite-store'
          );
          const tile = await getSeekThumbTile(key, sec);
          if (tile) {
            putMem(key, sec, tile);
            continue;
          }
        } catch {
          /* */
        }
        const my = ++gen;
        try {
          if (typeof (video as HTMLVideoElement & { fastSeek?: (n: number) => void }).fastSeek === 'function') {
            (video as HTMLVideoElement & { fastSeek: (n: number) => void }).fastSeek(sec);
          } else {
            video.currentTime = sec;
          }
        } catch {
          continue;
        }
        const ok = await waitVideoEvent(video, 'seeked', 8_000);
        if (!ok || ac.signal.aborted || my !== gen) continue;
        drawCover(video, canvas);
        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        } catch {
          break;
        }
        if (!dataUrl) continue;
        putMem(key, sec, { url: dataUrl });
        persistTried.add(`${key}#${storeBucket(sec)}`);
        await putSeekThumbFrame(key, sec, dataUrl);
        await new Promise<void>((r) => window.setTimeout(r, 60));
      }
    } finally {
      video.removeAttribute('src');
      video.load();
      video.remove();
      if (seedAbortByKey.get(key) === ac) seedAbortByKey.delete(key);
    }
  })();

  return () => {
    ac.abort();
    if (seedAbortByKey.get(key) === ac) seedAbortByKey.delete(key);
  };
}

export function abortAllSeekThumbSeeds(): void {
  for (const ac of seedAbortByKey.values()) ac.abort();
  seedAbortByKey.clear();
}
