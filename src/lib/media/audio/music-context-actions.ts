/**
 * 音乐右键菜单共享动作（对齐 lx OnlineList / MusicList）
 */

import {
  addTracksToPlaylist,
  getPlaylistTracks,
  listUserMusicPlaylists,
  removeTrackFromPlaylist,
  saveDislikeRule,
  setPlaylistTrackOrder,
} from '@/lib/database/audio-library';
import { enqueueTrackDownload } from '@/lib/media/audio/audio-download';
import { invalidateDislikeRulesCache } from '@/lib/media/audio/library/dislike-filter';
import { getSongListDetail } from '@/lib/media/audio/music-sdk';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { browseMfSheetDetail } from '@/lib/media/audio/online/mf-plugin/browse';
import {
  isMfSourceKey,
  parseMfPluginId,
  type MfSheetItem,
} from '@/lib/media/audio/online/mf-plugin/types';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  playPlaylist,
  playTracksLater,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { setSearchTab, searchByKeyword } from '@/stores/music-hub/search';
import { bindPlaylistToSource } from '@/lib/media/audio/list/sync-source-list';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';

export interface PlaylistTarget {
  listId: string;
  name: string;
}

export async function listPlaylistTargets(): Promise<PlaylistTarget[]> {
  const users = await listUserMusicPlaylists();
  return [
    { listId: BUILTIN_PLAYLIST_IDS.DEFAULT, name: '播放列表' },
    { listId: BUILTIN_PLAYLIST_IDS.LOVE, name: '我的收藏' },
    ...users.map((u) => ({ listId: u.listId, name: u.name })),
  ];
}

export function formatTrackDisplayName(track: AudioTrack): string {
  const artist = track.artist?.trim();
  return artist ? `${track.name} - ${artist}` : track.name;
}

export async function copyTrackName(track: AudioTrack): Promise<void> {
  await navigator.clipboard.writeText(formatTrackDisplayName(track));
  showAppToast({ title: '已复制歌曲名', variant: 'success' });
}

export function playTrackAt(tracks: AudioTrack[], index: number, origin?: 'search' | 'list'): void {
  void playPlaylist(tracks, index, {
    origin: origin ?? 'other',
    listKind: origin === 'search' ? 'search' : origin === 'list' ? 'temporary' : 'single',
    listName: origin === 'search' ? '搜索结果' : origin === 'list' ? '当前列表' : null,
  });
}

export function playTrackLater(track: AudioTrack): void {
  playTracksLater([track]);
  showAppToast({ title: '已添加到下一首播放', variant: 'success' });
}

export function playTracksLaterFromMenu(tracks: AudioTrack[]): void {
  playTracksLater(tracks);
  showAppToast({ title: `已添加 ${tracks.length} 首到下一首播放`, variant: 'success' });
}

export async function downloadTrack(
  track: AudioTrack,
  quality?: MusicQuality,
): Promise<void> {
  if (track.source === 'local') {
    showAppToast({ title: '本地曲目无需下载', variant: 'warning' });
    return;
  }
  await enqueueTrackDownload(track, quality ? { quality } : undefined);
  showAppToast({ title: '已加入下载队列', variant: 'success' });
}

export async function downloadTracks(
  tracks: AudioTrack[],
  playlistId?: string | null,
  quality?: MusicQuality,
): Promise<void> {
  const downloadable = tracks.filter((track) => track.source !== 'local');
  if (downloadable.length === 0) {
    showAppToast({ title: '没有可下载的歌曲', variant: 'warning' });
    return;
  }
  const playlistName = playlistId
    ? (await listPlaylistTargets()).find((playlist) => playlist.listId === playlistId)?.name
    : undefined;
  for (const track of downloadable) {
    await enqueueTrackDownload(track, { playlistName, quality });
  }
  showAppToast({ title: `已加入下载队列 ${downloadable.length} 首`, variant: 'success' });
}

export async function addTrackToPlaylist(playlistId: string, track: AudioTrack): Promise<void> {
  await addTracksToPlaylist(playlistId, [track], {
    position: getMusicSettings().listAddPosition,
  });
  showAppToast({ title: '已添加到列表', variant: 'success' });
}

export async function moveTrackToPlaylist(
  fromPlaylistId: string,
  toPlaylistId: string,
  track: AudioTrack,
): Promise<void> {
  if (fromPlaylistId === toPlaylistId) return;
  await addTracksToPlaylist(toPlaylistId, [track], {
    position: getMusicSettings().listAddPosition,
  });
  await removeTrackFromPlaylist(fromPlaylistId, track.id);
  showAppToast({ title: '已移动到目标列表', variant: 'success' });
}

export async function removeTrackFromList(playlistId: string, trackId: string): Promise<void> {
  await removeTrackFromPlaylist(playlistId, trackId);
  showAppToast({ title: '已从列表移除', variant: 'success' });
}

export async function removeTracksFromList(
  playlistId: string,
  tracks: AudioTrack[],
): Promise<void> {
  for (const track of tracks) await removeTrackFromPlaylist(playlistId, track.id);
  showAppToast({ title: `已从列表移除 ${tracks.length} 首`, variant: 'success' });
}

export async function dislikeTrack(track: AudioTrack): Promise<void> {
  const escapedName = track.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await saveDislikeRule({
    id: `dislike_${Date.now()}`,
    pattern: `^${escapedName}$`,
    field: 'name',
  });
  invalidateDislikeRulesCache();
  showAppToast({ title: '已加入不喜欢', variant: 'success' });
}

export function searchSimilarTrack(track: AudioTrack): void {
  const kw = formatTrackDisplayName(track);
  setMusicSection('search');
  setSearchTab('song');
  void searchByKeyword(kw);
}

/** 构架源详情页 URL（各平台公开页） */
export function buildTrackSourceDetailUrl(track: AudioTrack): string | null {
  const songId = String(track.meta.songId ?? track.id.split('_').pop() ?? '').trim();
  if (!songId) return null;
  switch (track.source) {
    case 'wy':
    case 'netease':
      return `https://music.163.com/#/song?id=${encodeURIComponent(songId)}`;
    case 'kw':
      return `https://www.kuwo.cn/play_detail/${encodeURIComponent(songId)}`;
    case 'kg':
      return `https://www.kugou.com/song/#hash=${encodeURIComponent(songId)}`;
    case 'tx':
      return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(songId)}`;
    case 'mg':
      return `https://music.migu.cn/v3/music/song/${encodeURIComponent(songId)}`;
    case 'bili': {
      const bvid = String(track.meta.bvid ?? songId);
      return `https://www.bilibili.com/video/${encodeURIComponent(bvid)}`;
    }
    case 'ytm': {
      const videoId = String(track.meta.videoId ?? songId);
      return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
    default:
      return null;
  }
}

export async function openTrackSourceDetail(track: AudioTrack): Promise<void> {
  const url = buildTrackSourceDetailUrl(track);
  if (!url) {
    showAppToast({ title: '暂无源详情页', variant: 'warning' });
    return;
  }
  await openUrlInBrowser(url);
}

export async function openPlaylistSourceDetail(
  playlist: OnlinePlaylistSummary,
): Promise<void> {
  const id = playlist.id;
  let url: string | null = null;
  switch (playlist.source) {
    case 'wy':
      url = `https://music.163.com/#/playlist?id=${encodeURIComponent(id)}`;
      break;
    case 'kw':
      url = `https://www.kuwo.cn/playlist_detail/${encodeURIComponent(id)}`;
      break;
    case 'kg':
      url = `https://www.kugou.com/yy/special/single/${encodeURIComponent(id)}.html`;
      break;
    case 'tx':
      url = `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(id)}`;
      break;
    case 'mg':
      url = `https://music.migu.cn/v3/music/playlist/${encodeURIComponent(id)}`;
      break;
    default:
      break;
  }
  if (!url) {
    showAppToast({ title: '暂无源详情页', variant: 'warning' });
    return;
  }
  await openUrlInBrowser(url);
}

async function resolveOnlinePlaylistTracks(
  playlist: OnlinePlaylistSummary,
): Promise<AudioTrack[]> {
  if (isMfSourceKey(String(playlist.source))) {
    const pluginId =
      playlist.mfPluginId ?? parseMfPluginId(String(playlist.source));
    if (!pluginId) return [];
    const sheet =
      playlist.mfSheetItem ??
      ({ id: playlist.id, platform: pluginId } as MfSheetItem);
    const result = await browseMfSheetDetail(pluginId, sheet, 1);
    return result.tracks;
  }
  const detail = await getSongListDetail(
    playlist.source as MusicSdkSource,
    playlist.id,
  );
  return detail.tracks;
}

export async function playOnlinePlaylist(playlist: OnlinePlaylistSummary): Promise<void> {
  showAppToast({ title: '正在加载歌单…' });
  const tracks = await resolveOnlinePlaylistTracks(playlist);
  if (tracks.length === 0) {
    showAppToast({ title: '歌单暂无歌曲', variant: 'warning' });
    return;
  }
  const { playAsTemp } = await import('@/stores/viewer/media/audio');
  void playAsTemp(tracks, 0, {
    listName: playlist.name,
    listKind: 'online-playlist',
  });
}

export async function collectOnlinePlaylist(playlist: OnlinePlaylistSummary): Promise<void> {
  const tracks = await resolveOnlinePlaylistTracks(playlist);
  await addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, tracks);
  if (!isMfSourceKey(String(playlist.source))) {
    bindPlaylistToSource({
      playlistId: BUILTIN_PLAYLIST_IDS.DEFAULT,
      source: playlist.source as MusicSdkSource,
      type: 'songlist',
      sourceId: playlist.id,
    });
  }
  showAppToast({
    title: `已收藏 ${tracks.length} 首到播放列表`,
    variant: 'success',
  });
}

export async function copyText(text: string, toast = '已复制'): Promise<void> {
  await navigator.clipboard.writeText(text);
  showAppToast({ title: toast, variant: 'success' });
}

/** 将曲目调整到指定序号（0-based）并写回列表 */
export async function moveTrackToPosition(
  playlistId: string,
  trackId: string,
  position: number,
): Promise<void> {
  const tracks = await getPlaylistTracks(playlistId);
  const from = tracks.findIndex((t) => t.id === trackId);
  if (from < 0) return;
  const next = [...tracks];
  const [item] = next.splice(from, 1);
  const to = Math.max(0, Math.min(Math.floor(position), next.length));
  next.splice(to, 0, item!);
  await setPlaylistTrackOrder(playlistId, next);
}

export async function moveTracksToPosition(
  playlistId: string,
  trackIds: string[],
  position: number,
): Promise<void> {
  const tracks = await getPlaylistTracks(playlistId);
  const selected = new Set(trackIds);
  const moving = tracks.filter((track) => selected.has(track.id));
  if (moving.length === 0) return;
  const remaining = tracks.filter((track) => !selected.has(track.id));
  const target = Math.max(0, Math.min(Math.floor(position), remaining.length));
  remaining.splice(target, 0, ...moving);
  await setPlaylistTrackOrder(playlistId, remaining);
}
