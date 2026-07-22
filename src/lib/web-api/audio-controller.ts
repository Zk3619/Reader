/**
 * Legado Web 服务 — 音乐 API（列表查看 + 播放，对标书架/阅读）
 */

import { viewerStore } from '@/stores/viewer';
import { searchOnline } from '@/lib/media/audio/online/source-router';
import {
  audioShellTogglePlay,
  audioShellSkipNext,
  audioShellSkipPrev,
  hasAudioShellHandlers,
} from '@/lib/media/audio/audio-shell-controls';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { legadoOk, legadoErr } from '@/lib/web-api/return-data';
import type { WebApiDispatchResult } from '@/lib/web-api/response';
import { binaryApiResult, jsonApiResult } from '@/lib/web-api/response';

function trackSummary(track: AudioTrack) {
  return {
    id: track.id,
    name: track.name,
    artist: track.artist,
    source: track.source,
    duration: track.duration,
    coverUrl: typeof track.meta.coverUrl === 'string' ? track.meta.coverUrl : undefined,
  };
}

export async function getAudioStatusApi(): Promise<WebApiDispatchResult> {
  const state = viewerStore.state;
  const track = state.trackQueue[state.trackIndex];
  const isMusic = state.playbackMode === 'music';
  return jsonApiResult(
    legadoOk({
      playbackMode: state.playbackMode,
      playing: hasAudioShellHandlers(),
      trackIndex: state.trackIndex,
      queueLength: state.trackQueue.length,
      current: track ? trackSummary(track) : null,
      primaryUrl: isMusic ? state.musicPrimaryUrl : state.primaryUrl,
      loading: isMusic ? state.musicLoading : state.loading,
      error: isMusic ? state.musicError : state.error,
    }),
  );
}

export async function postAudioPlayApi(body: string | null): Promise<WebApiDispatchResult> {
  let action = 'toggle';
  let trackId: string | undefined;
  let playlistId: string | undefined;
  let index: number | undefined;
  try {
    const parsed = body
      ? (JSON.parse(body) as {
          action?: string;
          trackId?: string;
          playlistId?: string;
          index?: number;
        })
      : {};
    action = parsed.action ?? 'toggle';
    trackId = parsed.trackId;
    playlistId = parsed.playlistId;
    index = parsed.index;
  } catch {
    // default toggle
  }

  if (action === 'play-track' && (trackId || playlistId != null)) {
    try {
      const { getPlaylistTracks, getAudioTrack } = await import('@/lib/database/audio-library');
      let tracks: AudioTrack[] = [];
      let startIndex = 0;
      if (playlistId) {
        tracks = await getPlaylistTracks(playlistId);
        if (trackId) {
          const i = tracks.findIndex((t) => t.id === trackId);
          if (i >= 0) startIndex = i;
        } else if (typeof index === 'number' && index >= 0) {
          startIndex = index;
        }
      } else if (trackId) {
        const t = await getAudioTrack(trackId);
        if (t) tracks = [t];
      }
      if (tracks.length === 0) {
        return jsonApiResult(legadoErr('未找到曲目'));
      }
      const { playPlaylist } = await import('@/stores/viewer/media/audio');
      await playPlaylist(tracks, startIndex, {
        listId: playlistId,
        listKind: playlistId ? 'user' : 'temporary',
        listName: 'Web 播放',
      });
      return jsonApiResult(legadoOk({ ok: true, action: 'play-track' }));
    } catch (error) {
      return jsonApiResult(
        legadoErr(error instanceof Error ? error.message : '播放失败'),
      );
    }
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

export async function getAudioPlaylistsApi(): Promise<WebApiDispatchResult> {
  const { getMusicGroups } = await import('@/lib/database/media-groups');
  const { getPlaylistTracks } = await import('@/lib/database/audio-library');
  const groups = await getMusicGroups();
  const lists = [];
  for (const g of groups) {
    if (!g.listId) continue;
    const tracks = await getPlaylistTracks(g.listId);
    lists.push({
      id: g.listId,
      name: g.groupName,
      trackCount: tracks.length,
    });
  }
  return jsonApiResult(legadoOk({ playlists: lists }));
}

export async function getAudioPlaylistApi(
  query: Record<string, string>,
): Promise<WebApiDispatchResult> {
  const id = query.id?.trim();
  if (!id) return jsonApiResult(legadoErr('缺少 id'));
  const { getPlaylistTracks } = await import('@/lib/database/audio-library');
  const { getMusicGroupByListId } = await import('@/lib/database/media-groups');
  const group = await getMusicGroupByListId(id);
  const tracks = await getPlaylistTracks(id);
  return jsonApiResult(
    legadoOk({
      id,
      name: group?.groupName ?? id,
      tracks: tracks.map(trackSummary),
    }),
  );
}

export async function getAudioTrackUrlApi(
  query: Record<string, string>,
): Promise<WebApiDispatchResult> {
  const id = query.id?.trim();
  if (!id) return jsonApiResult(legadoErr('缺少 id'));
  const { getAudioTrack } = await import('@/lib/database/audio-library');
  const track = await getAudioTrack(id);
  if (!track) return jsonApiResult(legadoErr('曲目不存在'));

  try {
    const { resolveTrackPlaybackUrls } = await import(
      '@/lib/media/audio/online/online-resolver'
    );
    const { urls } = await resolveTrackPlaybackUrls(track);
    const url = urls[0];
    if (!url) return jsonApiResult(legadoErr('无法解析播放地址'));
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return jsonApiResult(legadoOk({ id, url, mode: 'direct' }));
    }
    // 本地 / blob：浏览器端走流式代理
    return jsonApiResult(
      legadoOk({
        id,
        url: `/audio/stream?id=${encodeURIComponent(id)}`,
        mode: 'stream',
      }),
    );
  } catch (error) {
    return jsonApiResult(
      legadoErr(error instanceof Error ? error.message : '取链失败'),
    );
  }
}

export async function getAudioStreamApi(
  query: Record<string, string>,
): Promise<WebApiDispatchResult> {
  const id = query.id?.trim();
  if (!id) return jsonApiResult(legadoErr('缺少 id'));
  const { getAudioTrack } = await import('@/lib/database/audio-library');
  const track = await getAudioTrack(id);
  if (!track) return jsonApiResult(legadoErr('曲目不存在'));

  const { resolveTrackPlaybackUrls } = await import(
    '@/lib/media/audio/online/online-resolver'
  );
  const { urls, revokeAll } = await resolveTrackPlaybackUrls(track);
  try {
    const url = urls[0];
    if (!url) return jsonApiResult(legadoErr('无法解析播放地址'));

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'audio/mpeg';
      return binaryApiResult(buf, ct);
    }

    if (url.startsWith('blob:')) {
      const res = await fetch(url);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'audio/mpeg';
      return binaryApiResult(buf, ct);
    }

    // asset / file path via filesystem
    const filePath =
      typeof track.meta.filePath === 'string' ? track.meta.filePath.trim() : '';
    if (filePath) {
      const { getFileSystem } = await import('@/lib/platform/filesystem');
      const fs = await getFileSystem();
      const bytes = await fs.readFile(filePath);
      return binaryApiResult(new Uint8Array(bytes), 'audio/mpeg');
    }

    return jsonApiResult(legadoErr('无法流式输出该曲目'));
  } finally {
    revokeAll();
  }
}

export async function postAudioProgressApi(body: string | null): Promise<WebApiDispatchResult> {
  try {
    const parsed = body
      ? (JSON.parse(body) as { trackId?: string; positionSec?: number })
      : {};
    const trackId = parsed.trackId?.trim();
    const positionSec = Number(parsed.positionSec);
    if (!trackId || !Number.isFinite(positionSec)) {
      return jsonApiResult(legadoErr('参数无效'));
    }
    const { saveMusicTrackProgress, musicTrackProgressKey } = await import(
      '@/lib/media/audio/music-track-progress'
    );
    const { getAudioTrack } = await import('@/lib/database/audio-library');
    const track = await getAudioTrack(trackId);
    if (!track) return jsonApiResult(legadoErr('曲目不存在'));
    saveMusicTrackProgress(musicTrackProgressKey(track.source, track.id), positionSec);
    return jsonApiResult(legadoOk({ ok: true }));
  } catch (error) {
    return jsonApiResult(
      legadoErr(error instanceof Error ? error.message : '保存失败'),
    );
  }
}
