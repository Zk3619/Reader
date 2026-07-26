/**
 * Web Enhance 引擎：Anime4K-WebGPU + RIFE ORT 级联 + MediaClock
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type {
  PlaybackEngine,
  PlaybackLoadOptions,
  PlaybackTrackInfo,
  Anime4KMode,
  Anime4KQuality,
} from '@/lib/media/video/playback/types';
import { MediaClock, PipelineEpoch } from '@/lib/media/video/enhance/media-clock';
import { createAnime4KWebRenderer } from '@/lib/media/video/enhance/anime4k-webgl';
import { createAnime4KWebGpuRenderer } from '@/lib/media/video/enhance/anime4k-webgpu-renderer';
import {
  EnhanceWatchdog,
  FrameBudgetAccumulator,
} from '@/lib/media/video/enhance/watchdog';
import {
  decideRifeCascade,
  isRifeSessionInitFailed,
  runRifeInterpolate,
} from '@/lib/media/video/enhance/rife-web';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

export type WebEnhanceEngineHooks = {
  onTimeUpdate?: (mediaTime: number, duration: number) => void;
  onError?: (err: Error) => void;
  onReady?: () => void;
  onBudget?: (report: ReturnType<FrameBudgetAccumulator['report']>) => void;
  onWatchdogToast?: (msg: string) => void;
  onEnhanceStatus?: (s: string) => void;
};

type SrBackend =
  | { kind: 'webgpu'; api: NonNullable<Awaited<ReturnType<typeof createAnime4KWebGpuRenderer>>> }
  | { kind: 'webgl'; api: NonNullable<ReturnType<typeof createAnime4KWebRenderer>> }
  | { kind: '2d'; api: CanvasRenderingContext2D };

/** 在视口内按片源比例 contain，返回 CSS 像素下的画面框 */
export function containFit(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) {
    return { w: Math.max(1, Math.round(boxW) || 1), h: Math.max(1, Math.round(boxH) || 1) };
  }
  const scale = Math.min(boxW / srcW, boxH / srcH);
  return {
    w: Math.max(1, Math.round(srcW * scale)),
    h: Math.max(1, Math.round(srcH * scale)),
  };
}

function presentBoxCss(canvas: HTMLCanvasElement): { w: number; h: number } {
  const box = canvas.parentElement;
  return {
    w: Math.max(1, box?.clientWidth || canvas.clientWidth || 1),
    h: Math.max(1, box?.clientHeight || canvas.clientHeight || 1),
  };
}

export function createWebEnhanceEngine(
  canvas: HTMLCanvasElement,
  hooks: WebEnhanceEngineHooks = {},
): PlaybackEngine & {
  getClock: () => MediaClock;
  getEpoch: () => PipelineEpoch;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getBudgetReport: () => ReturnType<FrameBudgetAccumulator['report']>;
  setAnime4KMode: (mode: Anime4KMode) => void;
  setFrameInterpEnabled: (on: boolean) => void;
  captureFrameBlob: () => Promise<Blob | null>;
} {
  const clock = new MediaClock(() => {
    try {
      return audioCtx?.currentTime ?? performance.now() / 1000;
    } catch {
      return performance.now() / 1000;
    }
  });
  const epoch = new PipelineEpoch();
  const budget = new FrameBudgetAccumulator();

  let audioCtx: AudioContext | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let raf = 0;
  let duration = 0;
  let destroyed = false;
  let rate = 1;
  let visibilityPaused = false;
  let anime4kMode: Anime4KMode = getVideoPlaybackPrefs().anime4kMode;
  let anime4kQuality: Anime4KQuality = getVideoPlaybackPrefs().anime4kQuality;
  let sr: SrBackend | null = null;
  let painting = false;
  let lastA4kKey = '';
  let prevFrame: ImageData | null = null;
  let rifeBusy = false;
  /** 最新插帧；持续持有直至被替换（早期可见补帧路径） */
  let lastRifeBitmap: ImageBitmap | null = null;
  let rifeLastSnapMediaTime = -1;
  let snapCanvas: HTMLCanvasElement | null = null;
  let snapCtx: CanvasRenderingContext2D | null = null;
  let feedCanvas: HTMLCanvasElement | null = null;
  let feedCtx: CanvasRenderingContext2D | null = null;
  /** 实测片源帧率（getVideoPlaybackQuality）；未采样前为 null */
  let measuredSourceFps: number | null = null;
  let fpsProbeFrames = 0;
  let fpsProbeAt = 0;
  const fpsRing: number[] = [];
  let rifeSkipFpsTold = false;

  const prefs0 = getVideoPlaybackPrefs();
  const watchdog = new EnhanceWatchdog(
    { mode: anime4kMode, rifeEnabled: prefs0.frameInterpEnabled },
    {
      onDowngradeMode: (m) => {
        anime4kMode = m;
        lastA4kKey = '';
        hooks.onWatchdogToast?.(`Anime4K → ${m}`);
      },
      onDisableRife: () => {
        clearRifeState();
        hooks.onWatchdogToast?.('已关闭 RIFE（看门狗）');
      },
      onToast: (msg) => hooks.onWatchdogToast?.(msg),
    },
  );

  const stopRaf = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const clearRifeState = () => {
    epoch.bump();
    prevFrame = null;
    rifeBusy = false;
    rifeLastSnapMediaTime = -1;
    lastRifeBitmap?.close();
    lastRifeBitmap = null;
    lastA4kKey = '';
  };

  const resetFpsProbe = () => {
    measuredSourceFps = null;
    fpsProbeFrames = 0;
    fpsProbeAt = 0;
    fpsRing.length = 0;
    rifeSkipFpsTold = false;
  };

  /** 用已解码帧计数估片源 fps；高帧率片不应硬补 */
  const probeSourceFps = (video: HTMLVideoElement): number => {
    const q = (
      video as HTMLVideoElement & {
        getVideoPlaybackQuality?: () => { totalVideoFrames: number };
      }
    ).getVideoPlaybackQuality?.();
    const now = performance.now();
    if (q && typeof q.totalVideoFrames === 'number') {
      if (fpsProbeAt > 0 && now - fpsProbeAt >= 400) {
        const df = q.totalVideoFrames - fpsProbeFrames;
        const dt = (now - fpsProbeAt) / 1000;
        if (dt > 0 && df > 2) {
          fpsRing.push(df / dt);
          if (fpsRing.length > 6) fpsRing.shift();
          measuredSourceFps =
            fpsRing.reduce((a, b) => a + b, 0) / Math.max(1, fpsRing.length);
        }
        fpsProbeFrames = q.totalVideoFrames;
        fpsProbeAt = now;
      } else if (fpsProbeAt === 0) {
        fpsProbeFrames = q.totalVideoFrames;
        fpsProbeAt = now;
      }
    }
    // 未测出前按 24 估（动漫常见）；一旦测到用实测值
    return measuredSourceFps ?? 24;
  };

  /** 超分呈现高度封顶；补帧推理另有 ≤720 */
  const srProcessMaxHeight = (q: Anime4KQuality): number => {
    if (q === 'fast') return 1080;
    if (q === 'high') return 2160;
    return 1620;
  };

  const quantizeDisplayH = (raw: number, cap: number): number => {
    const q = Math.max(1, Math.round(raw / 8) * 8);
    return Math.max(8, Math.min(q, cap));
  };

  const ensureFeed = (fw: number, fh: number): HTMLCanvasElement => {
    if (!feedCanvas) {
      feedCanvas = document.createElement('canvas');
      feedCtx = feedCanvas.getContext('2d', { alpha: false });
    }
    if (feedCanvas.width !== fw || feedCanvas.height !== fh) {
      feedCanvas.width = fw;
      feedCanvas.height = fh;
    }
    return feedCanvas;
  };

  const captureSnap = (
    video: HTMLVideoElement,
    srcW: number,
    srcH: number,
    maxH: number,
  ): ImageData => {
    let cw = srcW;
    let ch = srcH;
    if (ch > maxH && maxH > 0) {
      const s = maxH / ch;
      cw = Math.max(1, Math.round(cw * s));
      ch = Math.max(1, Math.round(ch * s));
    }
    if (!snapCanvas) {
      snapCanvas = document.createElement('canvas');
      snapCtx = snapCanvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true,
      });
    }
    if (snapCanvas.width !== cw || snapCanvas.height !== ch) {
      snapCanvas.width = cw;
      snapCanvas.height = ch;
    }
    snapCtx!.drawImage(video, 0, 0, cw, ch);
    return snapCtx!.getImageData(0, 0, cw, ch);
  };

  const schedulePaint = () => {
    if (destroyed || raf) return;
    raf = requestAnimationFrame(paint);
  };

  const paint = () => {
    raf = 0;
    if (destroyed || !videoEl || !sr) return;
    if (painting) {
      schedulePaint();
      return;
    }
    painting = true;
    void (async () => {
      try {
        if (destroyed || !videoEl || !sr) return;
        const t0 = performance.now();
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        if (w > 0 && h > 0) {
          const prefs = getVideoPlaybackPrefs();
          anime4kQuality = prefs.anime4kQuality;
          const box = presentBoxCss(canvas);
          const fit = containFit(w, h, box.w, box.h);
          const dpr = Math.min(
            2,
            typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
          );
          const displayH = quantizeDisplayH(
            fit.h * dpr,
            srProcessMaxHeight(anime4kQuality),
          );
          const mode = watchdog.getMode();
          const displayW = Math.max(1, Math.round((w / Math.max(1, h)) * displayH));

          const sourceFps = probeSourceFps(videoEl);
          const rifeDec = decideRifeCascade({
            codedHeight: h,
            maxInputHeight: prefs.frameInterpMaxInputHeight,
            sourceFps,
            maxInputFps: prefs.frameInterpMaxInputFps,
            displayRefreshHz:
              typeof screen !== 'undefined'
                ? Number((screen as Screen & { refreshRate?: number }).refreshRate) || 60
                : 60,
            frameInterpEnabled: prefs.frameInterpEnabled,
            watchdogAllowsRife: watchdog.isRifeEnabled(),
            displayTargetHeight: displayH,
          });

          if (
            !rifeDec.runRife &&
            rifeDec.reason === 'maxInputFps' &&
            prefs.frameInterpEnabled &&
            !rifeSkipFpsTold &&
            measuredSourceFps != null
          ) {
            rifeSkipFpsTold = true;
            hooks.onWatchdogToast?.(
              `片源约 ${measuredSourceFps.toFixed(0)}fps ≥ 上限 ${prefs.frameInterpMaxInputFps}，已跳过补帧`,
            );
          }

          let source: CanvasImageSource = videoEl;
          let srcW = w;
          let srcH = h;

          if (rifeDec.runRife) {
            const processH = rifeDec.downsampleMax;
            const processW = Math.max(1, Math.round((w / h) * processH));
            const mediaT = videoEl.currentTime;
            // 采样间隔贴合片源帧距，避免对高帧率误密采（闸门通过后仍按真实 fps）
            const snapGap = Math.max(0.032, Math.min(0.06, 1 / Math.max(12, sourceFps)));

            if (
              !rifeBusy &&
              !isRifeSessionInitFailed() &&
              (rifeLastSnapMediaTime < 0 || mediaT - rifeLastSnapMediaTime >= snapGap)
            ) {
              rifeLastSnapMediaTime = mediaT;
              const snap = captureSnap(videoEl, w, h, processH);
              if (prevFrame) {
                rifeBusy = true;
                const submitted = epoch.current;
                const prev = prevFrame;
                void runRifeInterpolate({
                  prev,
                  next: snap,
                  t: 0.5,
                  epoch: submitted,
                  pipelineEpoch: epoch,
                })
                  .then((r) => {
                    if (!r) return;
                    lastRifeBitmap?.close();
                    lastRifeBitmap = r.bitmap;
                  })
                  .finally(() => {
                    rifeBusy = false;
                  });
              }
              prevFrame = snap;
            }

            // 有 mid 则持续呈现（可见补帧）；尺寸固定 process，避免抖动
            if (lastRifeBitmap) {
              source = lastRifeBitmap;
              srcW = lastRifeBitmap.width;
              srcH = lastRifeBitmap.height;
            } else {
              const feed = ensureFeed(processW, processH);
              feedCtx?.drawImage(videoEl, 0, 0, processW, processH);
              source = feed;
              srcW = processW;
              srcH = processH;
            }
          } else if (lastRifeBitmap || prevFrame) {
            clearRifeState();
          }

          let srMs = 0;
          const a4kOpts = {
            mode,
            quality: anime4kQuality,
            sourceHeight: srcH,
            displayHeight: displayH,
            displayWidth: displayW,
            forcedMode: mode,
          };
          // 补帧源尺寸用 process 标称，避免 bitmap 宽高偶发 ±1 重建管线
          const keySrc =
            rifeDec.runRife
              ? `${Math.round((w / h) * rifeDec.downsampleMax)}x${rifeDec.downsampleMax}`
              : `${srcW}x${srcH}`;
          const a4kKey = `${mode}|${anime4kQuality}|${keySrc}|${displayW}x${displayH}`;
          if (a4kKey !== lastA4kKey) {
            lastA4kKey = a4kKey;
            if (sr.kind === 'webgpu') await sr.api.setOptions(a4kOpts);
            else if (sr.kind === 'webgl') sr.api.setOptions({ ...a4kOpts, toneMap: false });
          }

          if (sr.kind === 'webgpu') {
            srMs = await sr.api.drawSource(source, srcW, srcH);
          } else if (sr.kind === 'webgl') {
            srMs = sr.api.drawVideoFrame(source, srcW, srcH);
          } else {
            if (canvas.width !== displayW || canvas.height !== displayH) {
              canvas.width = displayW;
              canvas.height = displayH;
            }
            sr.api.fillStyle = '#000';
            sr.api.fillRect(0, 0, displayW, displayH);
            sr.api.drawImage(source, 0, 0, srcW, srcH, 0, 0, displayW, displayH);
            srMs = performance.now() - t0;
          }

          const presentMs = performance.now() - t0;
          budget.push({ srMs, presentMs, totalMs: presentMs });
          watchdog.sample({ srMs, presentMs, totalMs: presentMs });
          if (budget.report().samples % 60 === 0) hooks.onBudget?.(budget.report());
        }
        hooks.onTimeUpdate?.(clock.mediaTimeNow(), duration);
      } finally {
        painting = false;
        if (!destroyed && videoEl && !videoEl.paused) schedulePaint();
      }
    })();
  };

  const ensureAudioCtx = () => {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  };

  const onVisibility = () => {
    if (destroyed || !videoEl) return;
    if (document.visibilityState === 'hidden') {
      visibilityPaused = true;
      videoEl.pause();
      clock.pause();
      stopRaf();
    } else if (visibilityPaused) {
      visibilityPaused = false;
      void videoEl.play().catch(() => {});
      clock.resume();
      stopRaf();
      raf = requestAnimationFrame(paint);
    }
  };

  return {
    id: 'artplayer' as const,

    async load(opts: PlaybackLoadOptions) {
      destroyed = false;
      stopRaf();
      budget.reset();
      clearRifeState();
      resetFpsProbe();

      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        videoEl.crossOrigin = 'anonymous';
        videoEl.style.display = 'none';
        document.body.appendChild(videoEl);
      }

      if (!sr) {
        const gpu = await createAnime4KWebGpuRenderer(canvas);
        if (gpu) {
          sr = { kind: 'webgpu', api: gpu };
          hooks.onEnhanceStatus?.('Anime4K: WebGPU CNN');
        } else {
          const gl = createAnime4KWebRenderer(canvas);
          if (gl) {
            sr = { kind: 'webgl', api: gl };
            hooks.onEnhanceStatus?.('Anime4K: WebGL2 fallback');
          } else {
            const ctx2d = canvas.getContext('2d', { alpha: false });
            if (!ctx2d) throw new Error('no canvas context');
            sr = { kind: '2d', api: ctx2d };
            hooks.onEnhanceStatus?.('Anime4K: passthrough');
          }
        }
      }

      ensureAudioCtx();
      videoEl.src = opts.url;
      videoEl.currentTime = opts.startSec ?? 0;
      videoEl.playbackRate = rate;

      await new Promise<void>((resolve, reject) => {
        if (!videoEl) return reject(new Error('no video'));
        const onMeta = () => {
          duration = videoEl!.duration || 0;
          cleanup();
          resolve();
        };
        const onErr = () => {
          cleanup();
          reject(new Error('video load failed'));
        };
        const cleanup = () => {
          videoEl?.removeEventListener('loadedmetadata', onMeta);
          videoEl?.removeEventListener('error', onErr);
        };
        videoEl.addEventListener('loadedmetadata', onMeta);
        videoEl.addEventListener('error', onErr);
      });

      document.addEventListener('visibilitychange', onVisibility);
      const p = getVideoPlaybackPrefs();
      anime4kMode = p.anime4kMode;
      anime4kQuality = p.anime4kQuality;
      watchdog.reset(anime4kMode, p.frameInterpEnabled);
      clock.anchor(opts.startSec ?? 0, ensureAudioCtx().currentTime);
      hooks.onReady?.();
    },

    async play() {
      if (!videoEl) return;
      await ensureAudioCtx().resume();
      await videoEl.play();
      clock.resume();
      stopRaf();
      raf = requestAnimationFrame(paint);
    },

    async pause() {
      videoEl?.pause();
      clock.pause();
      stopRaf();
    },

    async seek(sec: number) {
      if (!videoEl) return;
      clearRifeState();
      const t = Math.max(0, Math.min(duration || sec, sec));
      videoEl.currentTime = t;
      clock.anchor(t, ensureAudioCtx().currentTime);
    },

    async getPosition() {
      return clock.mediaTimeNow();
    },
    async getDuration() {
      return duration;
    },
    async listAudioTracks(): Promise<PlaybackTrackInfo[]> {
      return [];
    },
    async listSubtitleTracks(): Promise<PlaybackTrackInfo[]> {
      return [];
    },
    async setAudioTrack(_id: string) {},
    async setSubtitleTrack(_id: string | 'no') {},

    async destroy() {
      destroyed = true;
      stopRaf();
      document.removeEventListener('visibilitychange', onVisibility);
      if (sr?.kind === 'webgpu' || sr?.kind === 'webgl') sr.api.destroy();
      sr = null;
      clearRifeState();
      feedCanvas = null;
      feedCtx = null;
      snapCanvas = null;
      snapCtx = null;
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.remove();
        videoEl = null;
      }
      void audioCtx?.close();
      audioCtx = null;
    },

    getClock: () => clock,
    getEpoch: () => epoch,
    getBudgetReport: () => budget.report(),

    setPlaybackRate(r: number) {
      rate = r > 0 && Number.isFinite(r) ? r : 1;
      if (videoEl) videoEl.playbackRate = rate;
      clock.setRate(rate);
    },
    getPlaybackRate: () => rate,

    setAnime4KMode(mode: Anime4KMode) {
      anime4kMode = mode;
      lastA4kKey = '';
      watchdog.reset(mode, watchdog.isRifeEnabled());
    },

    setFrameInterpEnabled(on: boolean) {
      clearRifeState();
      rifeSkipFpsTold = false;
      watchdog.reset(anime4kMode, on);
    },

    async captureFrameBlob(): Promise<Blob | null> {
      // WebGPU：convertToBlob（若可用）；否则 toBlob
      const anyCanvas = canvas as HTMLCanvasElement & {
        convertToBlob?: (o?: ImageEncodeOptions) => Promise<Blob>;
      };
      try {
        if (typeof anyCanvas.convertToBlob === 'function') {
          return await anyCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        }
      } catch {
        /* */
      }
      return await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
        } catch {
          resolve(null);
        }
      });
    },
  };
}

export async function probeMediaRangeSupport(url: string): Promise<{
  ok: boolean;
  status?: number;
  acceptRanges?: string | null;
  detail: string;
}> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
    });
    const ar = res.headers.get('accept-ranges');
    return {
      ok: res.status === 206,
      status: res.status,
      acceptRanges: ar,
      detail:
        res.status === 206
          ? 'Range 206 OK'
          : `expected 206, got ${res.status} (seek may buffer fully)`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
