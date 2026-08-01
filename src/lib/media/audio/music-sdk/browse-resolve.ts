/**
 * 专辑 / 歌手详情：源别名、可用 ID 判断、从搜歌结果回退解析 ID
 * （右键进详情时常缺 singerId，或把艺人名误当 ID）
 */

import type { AudioTrack, AudioTrackMeta, AudioTrackSource } from '@/lib/media/audio/track-types';

/** 平台账号源 netease 与 LX 五源 wy 共用网易云详情接口 */
export function normalizeMusicBrowseSource(source: AudioTrackSource): AudioTrackSource {
  if (source === 'netease') return 'wy';
  return source;
}

export function primaryArtistName(artist: string): string {
  return artist.split(/[、,/&]/)[0]?.trim() || artist.trim();
}

/** wy/kg 歌手/专辑 ID 为纯数字；tx 歌手 mid / 专辑 mid 为字母数字 */
export function isUsableSingerBrowseId(
  singerId: string,
  source: AudioTrackSource,
  singerName?: string,
): boolean {
  const id = singerId.trim();
  if (!id || id === '0') return false;
  const name = singerName?.trim() || '';
  const primary = name ? primaryArtistName(name) : '';
  // 右键缺 ID 时曾把艺人名当成 ID 传入
  if (name && (id === name || id === primary)) return false;
  const src = normalizeMusicBrowseSource(source);
  if (src === 'wy' || src === 'kg') return /^\d+$/.test(id);
  if (src === 'tx') return /^[0-9A-Za-z]{8,24}$/.test(id);
  // kw/mg 无可靠 ID 详情，不把任意字符串当可用 ID
  if (src === 'kw' || src === 'mg') return false;
  return id.length > 0;
}

export function isUsableAlbumBrowseId(
  albumId: string,
  source: AudioTrackSource,
  albumName?: string,
): boolean {
  const id = albumId.trim();
  if (!id || id === '0') return false;
  const name = albumName?.trim() || '';
  if (name && id === name) return false;
  const src = normalizeMusicBrowseSource(source);
  if (src === 'wy' || src === 'kg') return /^\d+$/.test(id);
  if (src === 'tx') return /^[0-9A-Za-z]{8,24}$/.test(id);
  if (src === 'kw' || src === 'mg') return id.length > 0;
  return id.length > 0;
}

function artistMatches(trackArtist: string, target: string): 'exact' | 'soft' | false {
  const artists = trackArtist
    .split(/[、,/&]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (artists.some((a) => a === target)) return 'exact';
  if (artists.some((a) => a.includes(target) || target.includes(a))) return 'soft';
  return false;
}

/** 从搜歌结果中挑选最可能的 singerId */
export function pickSingerIdFromTracks(
  tracks: readonly AudioTrack[],
  singerName: string,
): string | null {
  const primary = primaryArtistName(singerName);
  if (!primary) return null;
  let softId: string | null = null;
  for (const t of tracks) {
    const id = String(t.meta.singerId ?? '').trim();
    if (!id || id === '0') continue;
    const match = artistMatches(t.artist, primary);
    if (match === 'exact') return id;
    if (match === 'soft' && !softId) softId = id;
  }
  if (softId) return softId;
  for (const t of tracks) {
    const id = String(t.meta.singerId ?? '').trim();
    if (id && id !== '0') return id;
  }
  return null;
}

/** 从搜歌结果中挑选最可能的 albumId / albumMid */
export function pickAlbumIdFromTracks(
  tracks: readonly AudioTrack[],
  albumName: string,
  artist?: string,
): string | null {
  const name = albumName.trim();
  if (!name) return null;
  const primaryArtist = artist ? primaryArtistName(artist) : '';
  let softId: string | null = null;
  for (const t of tracks) {
    const trackAlbum = String(t.meta.albumName ?? '').trim();
    if (!trackAlbum) continue;
    const id = String(t.meta.albumId ?? t.meta.albumMid ?? '').trim();
    if (!id || id === '0') continue;
    const nameExact = trackAlbum === name;
    const nameSoft = trackAlbum.includes(name) || name.includes(trackAlbum);
    if (!nameExact && !nameSoft) continue;
    if (primaryArtist) {
      const am = artistMatches(t.artist, primaryArtist);
      if (nameExact && am === 'exact') return id;
      if ((nameExact || nameSoft) && am && !softId) softId = id;
      continue;
    }
    if (nameExact) return id;
    if (!softId) softId = id;
  }
  return softId;
}

/** 右键菜单等：专辑 ID 优先 albumId，其次 albumMid（tx） */
export function trackAlbumBrowseId(track: {
  meta: Pick<AudioTrackMeta, 'albumId' | 'albumMid'> & Record<string, unknown>;
}): string {
  return String(track.meta.albumId ?? track.meta.albumMid ?? '').trim();
}
