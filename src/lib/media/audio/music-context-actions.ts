/**
 * 音乐右键菜单共享动作（对齐 lx OnlineList / MusicList）
 */

import {
  addTracksToPlaylist,
  getPlaylistTracks,
  listUserMusicPlaylists,
  removeTrackFromPlaylist,
  saveDislikeRule,
  setPlaylistTracks,
} from '@/lib/database/audio-library';
import { getGroupById, getMusicGroups } from '@/lib/database/media-groups';
import { enqueueTrackDownload } from '@/lib/media/audio/audio-download';
import { invalidateDislikeRulesCache } from '@/lib/media/audio/library/dislike-filter';
import { getSongListDetail } from '@/lib/media/audio/music-sdk';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  playPlaylist,
  playTracksLater,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { setSearchTab, searchByKeyword } from '@/stores/music-hub/search';
import { MediaGroupId } from '@/types/book-group';
import { bindPlaylistToSource } from '@/lib/media/audio/list/sync-source-list';

export interface PlaylistTarget {
  listId: string;
  name: string;
}

export async function listPlaylistTargets(): Promise<PlaylistTarget[]> {
  const [favorite, music, users] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
    listUserMusicPlaylists(),
  ]);
  const targets: PlaylistTarget[] = [];
  if (favorite?.listId) {
    targets.push({ listId: favorite.listId, name: favorite.groupName });
  }
  for (const g of music) {
    if (!g.listId || g.listId.startsWith('pl_')) continue;
    if (g.listId === 'love' || g.listId === favorite?.listId) continue;
    if (g.listId === BUILTIN_PLAYLIST_IDS.RECENT) continue;
    targets.push({ listId: g.listId, name: g.groupName });
  }
  for (const u of users) {
    targets.push({ listId: u.listId, name: u.name });
  }
  return targets;
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
  void playPlaylist(tracks, index, { origin: origin ?? 'other' });
}

export function playTrackLater(track: AudioTrack): void {
  playTracksLater([track]);
  showAppToast({ title: '已添加到下一首播放', variant: 'success' });
}

export async function downloadTrack(track: AudioTrack): Promise<void> {
  if (track.source === 'local') {
    showAppToast({ title: '本地曲目无需下载', variant: 'warning' });
    return;
  }
  await enqueueTrackDownload(track);
  showAppToast({ title: '已加入下载队列', variant: 'success' });
}

export async function addTrackToPlaylist(playlistId: string, track: AudioTrack): Promise<void> {
  await addTracksToPlaylist(playlistId, [track]);
  showAppToast({ title: '已添加到列表', variant: 'success' });
}

export async function moveTrackToPlaylist(
  fromPlaylistId: string,
  toPlaylistId: string,
  track: AudioTrack,
): Promise<void> {
  if (fromPlaylistId === toPlaylistId) return;
  await addTracksToPlaylist(toPlaylistId, [track]);
  await removeTrackFromPlaylist(fromPlaylistId, track.id);
  showAppToast({ title: '已移动到目标列表', variant: 'success' });
}

export async function removeTrackFromList(playlistId: string, trackId: string): Promise<void> {
  await removeTrackFromPlaylist(playlistId, trackId);
  showAppToast({ title: '已从列表移除', variant: 'success' });
}

export async function dislikeTrack(track: AudioTrack): Promise<void> {
  await saveDislikeRule({
    id: `dislike_${Date.now()}`,
    pattern: track.name,
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

export async function playOnlinePlaylist(playlist: OnlinePlaylistSummary): Promise<void> {
  showAppToast({ title: '正在加载歌单…' });
  const detail = await getSongListDetail(playlist.source, playlist.id);
  if (detail.tracks.length === 0) {
    showAppToast({ title: '歌单暂无歌曲', variant: 'warning' });
    return;
  }
  void playPlaylist(detail.tracks, 0, { origin: 'list' });
}

export async function collectOnlinePlaylist(playlist: OnlinePlaylistSummary): Promise<void> {
  const detail = await getSongListDetail(playlist.source, playlist.id);
  await addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, detail.tracks);
  bindPlaylistToSource({
    playlistId: BUILTIN_PLAYLIST_IDS.DEFAULT,
    source: playlist.source,
    type: 'songlist',
    sourceId: playlist.id,
  });
  showAppToast({
    title: `已收藏 ${detail.tracks.length} 首到默认列表`,
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
  await setPlaylistTracks(
    playlistId,
    next.map((t) => t.id),
  );
}
