/**
 * PlaybackRouter：按来源与偏好选择引擎
 */

import { probeLibMpvStatus } from '@/lib/media/video/playback/libmpv-engine';
import {
  getVideoPlaybackPrefs,
  type VideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import { isArtplayerOnlyProfile } from '@/lib/media/video/playback/video-profile';
import type {
  PlaybackEngineId,
  PlaybackRouteInput,
} from '@/lib/media/video/playback/types';

function isAndroidRuntime(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ &&
      /android/i.test(navigator.userAgent || '')
    );
  } catch {
    return false;
  }
}

function coerceDesktopEngine(engine: PlaybackEngineId): PlaybackEngineId {
  if (engine === 'media3' && !isAndroidRuntime()) return 'libmpv';
  return engine;
}

/** lite：禁内嵌 libmpv/Media3，保留 artplayer / external */
function coerceLiteEngine(engine: PlaybackEngineId): PlaybackEngineId {
  if (!isArtplayerOnlyProfile()) return engine;
  if (engine === 'libmpv' || engine === 'media3') return 'artplayer';
  return engine;
}

/** 纯函数：便于单测注入 prefs */
export function resolvePlaybackEngineWithPrefs(
  input: PlaybackRouteInput,
  prefs: Pick<VideoPlaybackPrefs, 'forceEngine' | 'localEngine'>,
): PlaybackEngineId {
  let engine: PlaybackEngineId;
  if (prefs.forceEngine !== 'auto') {
    engine = coerceDesktopEngine(prefs.forceEngine);
  } else if (input.forceEngine) {
    engine = coerceDesktopEngine(input.forceEngine);
  } else {
    const kind = input.sourceKind ?? 'hub_stream';
    const url = input.url.trim().toLowerCase();
    const isLocalLike =
      kind === 'file' || kind === 'webdav' || url.startsWith('file:');

    if (isLocalLike) {
      engine = coerceDesktopEngine(prefs.localEngine);
    } else if (kind === 'sniff') {
      // 嗅探直链常需独立进程；默认外置，仍可被 forceEngine 覆盖
      engine = 'external';
    } else {
      engine = 'artplayer';
    }
  }
  return coerceLiteEngine(engine);
}

export function resolvePlaybackEngine(input: PlaybackRouteInput): PlaybackEngineId {
  return resolvePlaybackEngineWithPrefs(input, getVideoPlaybackPrefs());
}

/** @deprecated 使用 {@link probeLibMpvAvailable}；同步版无法探测，恒 false 以免谎称可播 */
export function isLibMpvAvailable(): boolean {
  return false;
}

/** 真实探测桌面 libmpv（feature + 运行时 DLL） */
export async function probeLibMpvAvailable(): Promise<boolean> {
  const st = await probeLibMpvStatus();
  return st.available;
}
