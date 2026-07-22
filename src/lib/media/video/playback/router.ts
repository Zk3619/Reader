/**
 * PlaybackRouter：按来源与偏好选择引擎
 */

import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import type {
  PlaybackEngineId,
  PlaybackRouteInput,
} from '@/lib/media/video/playback/types';

function isAndroidRuntime(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      && /android/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

export function resolvePlaybackEngine(input: PlaybackRouteInput): PlaybackEngineId {
  const prefs = getVideoPlaybackPrefs();
  if (prefs.forceEngine !== 'auto') {
    if (prefs.forceEngine === 'media3' && !isAndroidRuntime()) {
      return 'libmpv';
    }
    return prefs.forceEngine;
  }
  if (input.forceEngine) {
    if (input.forceEngine === 'media3' && !isAndroidRuntime()) return 'libmpv';
    return input.forceEngine;
  }

  const kind = input.sourceKind ?? 'hub_stream';
  if (kind === 'file' || kind === 'webdav') return 'libmpv';

  const url = input.url.trim().toLowerCase();
  // file: 走 libmpv；纯 http 带本地后缀仍可走 artplayer（由调用方标 hub_stream）
  if (url.startsWith('file:')) return 'libmpv';

  return 'artplayer';
}

export function isLibMpvAvailable(): boolean {
  // feature 未编入时 Rust 返回 false
  return true;
}
