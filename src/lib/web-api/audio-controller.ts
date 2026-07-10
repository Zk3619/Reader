/**
 * Legado Web 服务 — 音乐 API
 */

import { viewerStore } from '@/stores/viewer';
import { searchOnline } from '@/lib/media/audio/online/source-router';
import {
  audioShellTogglePlay,
  audioShellSkipNext,
  audioShellSkipPrev,
  hasAudioShellHandlers,
} from '@/lib/media/audio/audio-shell-controls';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { legadoOk } from '@/lib/web-api/return-data';
import type { WebApiDispatchResult } from '@/lib/web-api/response';
import { jsonApiResult } from '@/lib/web-api/response';

export async function getAudioStatusApi(): Promise<WebApiDispatchResult> {
  const state = viewerStore.state;
  const track = state.trackQueue[state.trackIndex];
  return jsonApiResult(
    legadoOk({
      playbackMode: state.playbackMode,
      playing: hasAudioShellHandlers(),
      trackIndex: state.trackIndex,
      queueLength: state.trackQueue.length,
      current: track
        ? { id: track.id, name: track.name, artist: track.artist, source: track.source }
        : null,
      primaryUrl: state.primaryUrl,
      loading: state.loading,
      error: state.error,
    }),
  );
}

export async function postAudioPlayApi(body: string | null): Promise<WebApiDispatchResult> {
  let action = 'toggle';
  try {
    const parsed = body ? (JSON.parse(body) as { action?: string }) : {};
    action = parsed.action ?? 'toggle';
  } catch {
    // default toggle
  }
  switch (action) {
    case 'play':
    case 'pause':
    case 'toggle':
      audioShellTogglePlay();
      break;
    case 'next':
      audioShellSkipNext();
      break;
    case 'prev':
      audioShellSkipPrev();
      break;
    default:
      return jsonApiResult(legadoOk({ ok: false, error: 'unknown action' }));
  }
  return jsonApiResult(legadoOk({ ok: true, action }));
}

export async function getAudioSearchApi(
  query: Record<string, string>,
): Promise<WebApiDispatchResult> {
  const keyword = query.q?.trim() ?? query.keyword?.trim() ?? '';
  const source = (query.source ?? 'kw') as AudioTrackSource;
  if (!keyword) return jsonApiResult(legadoOk({ tracks: [], total: 0 }));
  const result = await searchOnline(source, keyword);
  return jsonApiResult(legadoOk(result));
}
