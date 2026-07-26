/**
 * 按 enhanceBackend / caps 分流打开增强（Web / mpv / rust-*）
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import {
  containerNeedsDemux,
  detectEnhanceCaps,
  resolveEnhancePipeline,
  type EnhancePipelineId,
  type ResolveEnhanceResult,
} from '@/lib/media/video/enhance';
import { createLibMpvEngine } from '@/lib/media/video/playback/libmpv-engine';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { openInExternalPlayer, getPreferredExternalPlayer } from '@/lib/media/tv/play/external-player';

export type OpenEnhanceRoutedInput = {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  startSec?: number;
  subtitle?: string;
};

export type OpenEnhanceRoutedResult = {
  pipeline: EnhancePipelineId;
  reason: string;
  toast?: string;
  /** web 管线由调用方挂 canvas 引擎；此处仅返回路由结果 */
  kind: 'web' | 'mpv' | 'external' | 'native' | 'none';
};

export async function resolveEnhanceForUrl(
  url: string,
): Promise<ResolveEnhanceResult & { capsReady: boolean }> {
  const prefs = getVideoPlaybackPrefs();
  const caps = await detectEnhanceCaps();
  const result = resolveEnhancePipeline({
    prefsBackend: prefs.enhanceBackend,
    webEnhanceEnabled: prefs.webEnhanceEnabled,
    caps,
    needsDemux: containerNeedsDemux(url),
    webOptIn: prefs.enhanceBackend === 'web',
  });
  return { ...result, capsReady: true };
}

/**
 * 打开增强：mpv/external/native 在此执行；web 返回 kind=web 由 UI 挂载 canvas。
 */
export async function openEnhanceRouted(
  input: OpenEnhanceRoutedInput,
): Promise<OpenEnhanceRoutedResult> {
  const prefs = getVideoPlaybackPrefs();
  const resolved = await resolveEnhanceForUrl(input.url);

  if (resolved.pipeline === 'none') {
    // 兼容旧行为：未选 web 且可试 libmpv
    if (prefs.enhanceBackend === 'auto' || prefs.enhanceBackend === 'mpv') {
      try {
        const eng = createLibMpvEngine();
        await eng.load({
          url: input.url,
          title: input.title,
          startSec: input.startSec,
          headers: input.headers,
          subtitle: input.subtitle ?? (prefs.preferredSubtitlePath || undefined),
          anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
        });
        return {
          pipeline: 'mpv',
          reason: 'fallback libmpv (legacy enhance button)',
          kind: 'mpv',
        };
      } catch {
        /* fall through */
      }
    }
    return {
      pipeline: 'none',
      reason: resolved.reason,
      toast: resolved.toast ?? '无可用增强管线',
      kind: 'none',
    };
  }

  if (resolved.pipeline === 'mpv') {
    const eng = createLibMpvEngine();
    await eng.load({
      url: input.url,
      title: input.title,
      startSec: input.startSec,
      headers: input.headers,
      subtitle: input.subtitle ?? (prefs.preferredSubtitlePath || undefined),
      anime4k: { mode: prefs.anime4kMode, quality: prefs.anime4kQuality },
    });
    return { pipeline: 'mpv', reason: resolved.reason, toast: resolved.toast, kind: 'mpv' };
  }

  if (
    resolved.pipeline === 'web-full' ||
    resolved.pipeline === 'web-sr' ||
    resolved.pipeline === 'video-overlay' ||
    resolved.pipeline === 'rust-demux'
  ) {
    return {
      pipeline: resolved.pipeline,
      reason: resolved.reason,
      toast: resolved.toast,
      kind: 'web',
    };
  }

  if (resolved.pipeline === 'rust-native') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('video_native_enhance_open_window', {
        args: {
          url: input.url,
          title: input.title,
          startSec: input.startSec,
        },
      });
      return {
        pipeline: 'rust-native',
        reason: resolved.reason,
        toast: resolved.toast,
        kind: 'native',
      };
    } catch (e) {
      return {
        pipeline: 'rust-native',
        reason: resolved.reason,
        toast: e instanceof Error ? e.message : String(e),
        kind: 'none',
      };
    }
  }

  await openInExternalPlayer(input.url, {
    kind: getPreferredExternalPlayer(),
    title: input.title,
    startSec: input.startSec,
  });
  return {
    pipeline: resolved.pipeline,
    reason: resolved.reason,
    kind: 'external',
  };
}
