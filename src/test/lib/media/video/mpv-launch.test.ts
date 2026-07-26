import { describe, expect, it } from 'vitest';
import {
  evaluateAnime4KAvailability,
  formatPlaybackToastDescription,
  resolveMpvLaunchOpts,
} from '@/lib/media/video/playback/mpv-launch';
import type { VideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';

function basePrefs(patch: Partial<VideoPlaybackPrefs>): VideoPlaybackPrefs {
  return {
    forceEngine: 'auto',
    localEngine: 'libmpv',
    androidFallbackMedia3: true,
    anime4kMode: 'off',
    anime4kQuality: 'balanced',
    anime4kDeblur: false,
    externalIpcEnabled: true,
    preferredSubtitlePath: '',
    anime4kShadersDir: '',
    externalKind: 'system',
    externalPresets: [],
    libmpvVideoOutput: 'gpu',
    libmpvHwdec: 'auto',
    anime4kForceGpuVo: true,
    anime4kHwdecAdapt: true,
    subFont: '',
    subFontSize: 0,
    subScale: 1,
    hdrToneMapping: 'auto',
    hdrTargetColorspaceHint: true,
    volume: 100,
    muted: false,
    listenOnly: false,
    audioEqPreset: 'off',
    frameInterpEnabled: false,
    frameInterpEngine: 'rife',
    frameInterpBackend: 'auto',
    frameInterpFactor: 2,
    frameInterpModel: '4.15_lite',
    frameInterpMaxInputFps: 30,
    frameInterpSceneDetect: true,
    frameInterpLightweightFallback: false,
    frameInterpMaxInputHeight: 1080,
    enhanceBackend: 'auto',
    webEnhanceEnabled: true,
    ...patch,
  };
}

describe('mpv launch opts', () => {
  it('forces GPU and D3D11VA-Copy when Anime4K on with defaults', () => {
    const launch = resolveMpvLaunchOpts(
      basePrefs({
        anime4kMode: 'A',
        libmpvVideoOutput: 'gpu-next',
        libmpvHwdec: 'd3d11va',
        anime4kForceGpuVo: true,
        anime4kHwdecAdapt: true,
      }),
    );
    expect(launch.anime4kOn).toBe(true);
    expect(launch.videoOutput).toBe('gpu');
    expect(launch.useGpuNext).toBe(false);
    expect(launch.hwdec).toBe('d3d11va-copy');
  });

  it('keeps GPU-Next when Anime4K off', () => {
    const launch = resolveMpvLaunchOpts(
      basePrefs({
        anime4kMode: 'off',
        libmpvVideoOutput: 'gpu-next',
      }),
    );
    expect(launch.anime4kOn).toBe(false);
    expect(launch.useGpuNext).toBe(true);
  });

  it('blocks Anime4K when GPU-Next without Force GPU', () => {
    const prefs = basePrefs({
      anime4kMode: 'A',
      libmpvVideoOutput: 'gpu-next',
      anime4kForceGpuVo: false,
    });
    expect(resolveMpvLaunchOpts(prefs).anime4kOn).toBe(false);
    expect(
      evaluateAnime4KAvailability({
        prefs,
        shadersReady: true,
        libmpvAvailable: true,
      }).usable,
    ).toBe(false);
  });

  it('requires Libmpv or external MPV for availability', () => {
    expect(
      evaluateAnime4KAvailability({
        prefs: basePrefs({ externalKind: 'system' }),
        shadersReady: true,
        libmpvAvailable: false,
      }).usable,
    ).toBe(false);
    expect(
      evaluateAnime4KAvailability({
        prefs: basePrefs({ externalKind: 'mpv' }),
        shadersReady: true,
        libmpvAvailable: false,
      }).usable,
    ).toBe(true);
  });

  it('formats External toast with concrete player label', () => {
    expect(
      formatPlaybackToastDescription(
        'external',
        'CCTV1综合',
        basePrefs({ externalKind: 'mpv' }),
      ),
    ).toBe('External · MPV · CCTV1综合');
    expect(formatPlaybackToastDescription('libmpv', 'Demo', basePrefs({}))).toBe(
      'Libmpv · Demo',
    );
  });

  it('disables Anime4K when Force Engine is Artplayer', () => {
    const r = evaluateAnime4KAvailability({
      prefs: basePrefs({ forceEngine: 'artplayer' }),
      shadersReady: true,
      libmpvAvailable: true,
    });
    expect(r.usable).toBe(false);
    expect(r.reasons.some((x) => /Artplayer/i.test(x))).toBe(true);
  });

  it('enables Anime4K controls when enhanceBackend is web (even with Artplayer)', () => {
    const r = evaluateAnime4KAvailability({
      prefs: basePrefs({ forceEngine: 'artplayer', enhanceBackend: 'web' }),
      shadersReady: false,
      libmpvAvailable: false,
    });
    expect(r.usable).toBe(true);
  });

  it('disables Anime4K when Force External is not MPV', () => {
    expect(
      evaluateAnime4KAvailability({
        prefs: basePrefs({ forceEngine: 'external', externalKind: 'vlc' }),
        shadersReady: true,
        libmpvAvailable: true,
      }).usable,
    ).toBe(false);
    expect(
      evaluateAnime4KAvailability({
        prefs: basePrefs({ forceEngine: 'external', externalKind: 'mpv' }),
        shadersReady: true,
        libmpvAvailable: false,
      }).usable,
    ).toBe(true);
  });
});
