import { describe, expect, it } from 'vitest';
import { MediaClock, PipelineEpoch } from '@/lib/media/video/enhance/media-clock';
import { resolveEnhancePipeline } from '@/lib/media/video/enhance/router';
import { containerNeedsDemux } from '@/lib/media/video/enhance/caps';
import { resolveAnime4KWebPass } from '@/lib/media/video/enhance/anime4k-webgl';
import { resolveAnime4KEffectChain } from '@/lib/media/video/enhance/anime4k-webgpu-renderer';
import { decideRifeCascade, guardRifeEpoch } from '@/lib/media/video/enhance/rife-web';
import { packRifeInput } from '@/lib/media/video/enhance/rife-session';
import { EnhanceWatchdog } from '@/lib/media/video/enhance/watchdog';
import type { EnhanceCaps } from '@/lib/media/video/enhance/types';

const fullCaps: EnhanceCaps = {
  webCodecs: true,
  webgpu: true,
  webgl2: true,
  importExternalImage: true,
  ortWebgpu: true,
  rustDemux: true,
  rustNative: false,
  mpv: true,
};

describe('MediaClock', () => {
  it('anchors and advances with rate', () => {
    let ctx = 10;
    const clock = new MediaClock(() => ctx);
    clock.anchor(5, 10);
    ctx = 12;
    expect(clock.mediaTimeNow()).toBeCloseTo(7, 5);
    clock.setRate(2);
    ctx = 13;
    expect(clock.mediaTimeNow()).toBeCloseTo(9, 5);
  });

  it('pause freezes media time', () => {
    let ctx = 0;
    const clock = new MediaClock(() => ctx);
    clock.anchor(1, 0);
    ctx = 2;
    clock.pause();
    ctx = 100;
    expect(clock.mediaTimeNow()).toBeCloseTo(3, 5);
  });
});

describe('PipelineEpoch', () => {
  it('bumps and rejects stale', () => {
    const e = new PipelineEpoch();
    const a = e.current;
    expect(e.isCurrent(a)).toBe(true);
    e.bump();
    expect(e.isCurrent(a)).toBe(false);
  });

  it('guardRifeEpoch drops stale', () => {
    const e = new PipelineEpoch();
    const sub = e.current;
    e.bump();
    let disposed = false;
    expect(
      guardRifeEpoch(e, sub, () => {
        disposed = true;
      }),
    ).toBe(false);
    expect(disposed).toBe(true);
  });
});

describe('resolveEnhancePipeline', () => {
  it('webEnhanceEnabled=false overrides backend=web', () => {
    const r = resolveEnhancePipeline({
      prefsBackend: 'web',
      webEnhanceEnabled: false,
      caps: fullCaps,
      needsDemux: false,
      webOptIn: true,
    });
    expect(r.pipeline).toBe('none');
  });

  it('auto does not pick web for mp4', () => {
    const r = resolveEnhancePipeline({
      prefsBackend: 'auto',
      webEnhanceEnabled: true,
      caps: fullCaps,
      needsDemux: false,
      webOptIn: false,
    });
    expect(r.pipeline).toBe('none');
  });

  it('mkv auto prefers mpv when available', () => {
    const r = resolveEnhancePipeline({
      prefsBackend: 'auto',
      webEnhanceEnabled: true,
      caps: fullCaps,
      needsDemux: true,
      webOptIn: false,
    });
    expect(r.pipeline).toBe('mpv');
  });

  it('mkv auto falls to rust-demux without mpv', () => {
    const r = resolveEnhancePipeline({
      prefsBackend: 'auto',
      webEnhanceEnabled: true,
      caps: { ...fullCaps, mpv: false },
      needsDemux: true,
      webOptIn: false,
    });
    expect(r.pipeline).toBe('rust-demux');
  });

  it('forced web picks web-full', () => {
    const r = resolveEnhancePipeline({
      prefsBackend: 'web',
      webEnhanceEnabled: true,
      caps: fullCaps,
      needsDemux: false,
      webOptIn: true,
    });
    expect(r.pipeline).toBe('web-full');
  });
});

describe('containerNeedsDemux', () => {
  it('mkv yes, m3u8 no, mp4 no', () => {
    expect(containerNeedsDemux('/a/b.mkv')).toBe(true);
    expect(containerNeedsDemux('http://x/y.m3u8')).toBe(false);
    expect(containerNeedsDemux('http://x/y.mp4')).toBe(false);
  });
});

describe('Anime4K / RIFE gates', () => {
  it('4K source >= display → restore-only', () => {
    const p = resolveAnime4KWebPass({
      mode: 'A',
      sourceHeight: 2160,
      displayHeight: 1080,
    });
    expect(p.pass).toBe('restore-only');
    expect(p.upscale).toBe(false);
  });

  it('restore-only uses stronger CNN on balanced', () => {
    const chain = resolveAnime4KEffectChain({
      mode: 'A',
      quality: 'balanced',
      sourceHeight: 2160,
      displayHeight: 1080,
    });
    expect(chain).toEqual(['ClampHighlights', 'CNNUL']);
  });

  it('Mode A balanced includes CNNx2', () => {
    const chain = resolveAnime4KEffectChain({
      mode: 'A',
      quality: 'balanced',
      sourceHeight: 720,
      displayHeight: 1440,
    });
    expect(chain[0]).toBe('ClampHighlights');
    expect(chain.some((c) => c.startsWith('CNNx2'))).toBe(true);
  });

  it('mild upscale balanced uses medium chain (single x2)', () => {
    const chain = resolveAnime4KEffectChain({
      mode: 'A',
      quality: 'balanced',
      sourceHeight: 1080,
      displayHeight: 1440,
    });
    expect(chain[0]).toBe('ClampHighlights');
    const x2 = chain.filter((c) => c.startsWith('CNNx2'));
    expect(x2.length).toBe(1);
    expect(chain).toContain('CNNVL');
  });

  it('mild upscale high keeps fuller chain', () => {
    const chain = resolveAnime4KEffectChain({
      mode: 'A',
      quality: 'high',
      sourceHeight: 1080,
      displayHeight: 1440,
    });
    const x2 = chain.filter((c) => c.startsWith('CNNx2'));
    expect(x2.length).toBeGreaterThanOrEqual(2);
  });

  it('MaxInputHeight blocks RIFE', () => {
    const d = decideRifeCascade({
      codedHeight: 2160,
      maxInputHeight: 1080,
      sourceFps: 24,
      maxInputFps: 30,
      displayRefreshHz: 60,
      frameInterpEnabled: true,
      watchdogAllowsRife: true,
    });
    expect(d.runRife).toBe(false);
    if (!d.runRife) expect(d.reason).toBe('maxInputHeight');
  });

  it('high source fps blocks RIFE (default max 30)', () => {
    const d = decideRifeCascade({
      codedHeight: 720,
      maxInputHeight: 1080,
      sourceFps: 60,
      maxInputFps: 30,
      displayRefreshHz: 60,
      frameInterpEnabled: true,
      watchdogAllowsRife: true,
    });
    expect(d.runRife).toBe(false);
    if (!d.runRife) expect(d.reason).toBe('maxInputFps');
  });

  it('24fps anime allows RIFE under default gate', () => {
    const d = decideRifeCascade({
      codedHeight: 720,
      maxInputHeight: 1080,
      sourceFps: 24,
      maxInputFps: 30,
      displayRefreshHz: 60,
      frameInterpEnabled: true,
      watchdogAllowsRife: true,
    });
    expect(d.runRife).toBe(true);
    if (d.runRife) expect(d.downsampleMax).toBe(720);
  });

  it('containFit letterboxes to one filled edge', async () => {
    const { containFit } = await import('@/lib/media/video/enhance/web-engine');
    // 16:9 in taller box → width fills
    expect(containFit(1920, 1080, 800, 800)).toEqual({ w: 800, h: 450 });
    // 16:9 in wider box → height fills
    expect(containFit(1920, 1080, 1600, 600)).toEqual({ w: 1067, h: 600 });
  });

  it('watchdog eventually disables rife after mode off', () => {
    const w = new EnhanceWatchdog(
      { mode: 'C', rifeEnabled: true },
      {},
      { budgetMs: 1, streakLimit: 2 },
    );
    w.sample({ totalMs: 50 });
    w.sample({ totalMs: 50 });
    expect(w.getMode()).toBe('off');
    w.sample({ totalMs: 50 });
    w.sample({ totalMs: 50 });
    expect(w.isRifeEnabled()).toBe(false);
  });

  it('packRifeInput v2 → 7 channels with t plane', () => {
    const mk = (v: number) =>
      ({
        width: 4,
        height: 4,
        data: new Uint8ClampedArray(4 * 4 * 4).fill(v),
        colorSpace: 'srgb',
      }) as ImageData;
    const packed = packRifeInput({ prev: mk(10), next: mk(20), t: 0.5, impl: 2 });
    expect(packed.dims).toEqual([1, 7, 4, 4]);
    const plane = 4 * 4;
    expect(packed.data[6 * plane]).toBeCloseTo(0.5, 5);
  });

  it('packRifeInput v1 → 11 channels', () => {
    const mk = () =>
      ({
        width: 32,
        height: 32,
        data: new Uint8ClampedArray(32 * 32 * 4),
        colorSpace: 'srgb',
      }) as ImageData;
    const packed = packRifeInput({ prev: mk(), next: mk(), t: 0.25, impl: 1 });
    expect(packed.dims[1]).toBe(11);
    expect(packed.dims[2]! % 32).toBe(0);
  });
});
