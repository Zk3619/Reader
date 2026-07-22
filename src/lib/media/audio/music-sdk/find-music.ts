/**
 * findMusic 多级打分（对齐 Neri/LX 跨源匹配意图，不绑单一平台）
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import { buildTrackId } from '@/lib/media/audio/track-types';
import * as kw from '@/lib/media/audio/online/sources/kw';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kg from '@/lib/media/audio/online/sources/kg';
import * as tx from '@/lib/media/audio/online/sources/tx';
import * as mg from '@/lib/media/audio/online/sources/mg';

const SOURCES: AudioTrackSource[] = ['kw', 'wy', 'kg', 'tx', 'mg'];

const singersRxp = /、|&|;|；|\/|,|，|\|/;

function sortSingle(singer: string): string {
  return singersRxp.test(singer)
    ? singer.split(singersRxp).sort((a, b) => a.localeCompare(b)).join('、')
    : singer || '';
}

function getIntv(interval: string): number {
  if (!interval) return 0;
  const parts = interval.split(':');
  let intv = 0;
  let unit = 1;
  while (parts.length) {
    intv += parseInt(parts.pop() ?? '0', 10) * unit;
    unit *= 60;
  }
  return intv;
}

function filterStr(str: string): string {
  return str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '');
}

type EnrichedHit = Record<string, unknown> & {
  fSinger: string;
  fMusicName: string;
  fAlbumName: string;
  fInterval: number;
  _matchScore?: number;
};

function mapEnrichedHitToTrack(item: EnrichedHit): AudioTrack {
  return mapHitToTrack({
    name: String(item.name ?? ''),
    singer: String(item.singer ?? ''),
    source: String(item.source ?? ''),
    interval: String(item.interval ?? ''),
    songmid: item.songmid != null ? String(item.songmid) : undefined,
    songId: item.songId != null ? String(item.songId) : undefined,
    hash: item.hash != null ? String(item.hash) : undefined,
    hash_320: item.hash_320 != null ? String(item.hash_320) : undefined,
    hash_flac: item.hash_flac != null ? String(item.hash_flac) : undefined,
    hash_high: item.hash_high != null ? String(item.hash_high) : undefined,
    mediaMid: item.mediaMid != null ? String(item.mediaMid) : undefined,
    albumMid: item.albumMid != null ? String(item.albumMid) : undefined,
    copyrightId: item.copyrightId != null ? String(item.copyrightId) : undefined,
    albumName: item.albumName != null ? String(item.albumName) : undefined,
    albumId: item.albumId != null ? String(item.albumId) : undefined,
    _qualitys: item._qualitys as Record<string, { hash: string }> | undefined,
    qualitys: Array.isArray(item.qualitys) ? (item.qualitys as string[]) : undefined,
  });
}

function mapHitToTrack(hit: {
  name: string;
  singer: string;
  source: string;
  interval: string;
  songmid?: string;
  songId?: string;
  hash?: string;
  hash_320?: string;
  hash_flac?: string;
  hash_high?: string;
  mediaMid?: string;
  albumMid?: string;
  copyrightId?: string;
  albumName?: string;
  albumId?: string;
  _qualitys?: Record<string, { hash: string }>;
  qualitys?: string[];
}): AudioTrack {
  const source = hit.source as AudioTrackSource;
  const songId = String(hit.songId ?? hit.songmid ?? '');
  const idKey =
    source === 'kg' && hit.hash ? `${songId}_${hit.hash}` : hit.copyrightId ?? songId;
  return {
    id: buildTrackId(source, idKey),
    name: hit.name,
    artist: hit.singer,
    source,
    duration: hit.interval || '00:00',
    meta: {
      songId,
      songmid: hit.songmid ?? songId,
      hash: hit.hash,
      hash_320: hit.hash_320,
      hash_flac: hit.hash_flac,
      hash_high: hit.hash_high,
      mediaMid: hit.mediaMid,
      strMediaMid: hit.mediaMid,
      albumMid: hit.albumMid,
      albumId: hit.albumId,
      copyrightId: hit.copyrightId,
      albumName: hit.albumName,
      _qualitys: hit._qualitys,
      qualitys: hit.qualitys,
    },
  };
}

async function searchSource(
  source: AudioTrackSource,
  name: string,
  singer: string,
): Promise<Array<Record<string, unknown>>> {
  const keyword = `${name} ${singer}`.trim();
  if (!keyword) return [];
  try {
    switch (source) {
      case 'kw': {
        const r = await kw.kwSearch(keyword, 1, 15);
        return r.tracks.map((t) => ({
          name: t.name,
          singer: t.artist,
          source: 'kw',
          interval: t.duration,
          songId: t.meta.songId,
          songmid: t.meta.songmid,
          albumName: t.meta.albumName,
          albumId: t.meta.albumId,
          _qualitys: t.meta._qualitys,
          qualitys: t.meta.qualitys,
        }));
      }
      case 'wy': {
        const tracks = await wy.wySearch(keyword, 1, 15);
        return tracks.map((t) => ({
          name: t.name,
          singer: t.artist,
          source: 'wy',
          interval: t.duration,
          songId: t.meta.songId,
          songmid: t.meta.songId,
          albumName: t.meta.albumName,
        }));
      }
      case 'kg': {
        const r = await kg.kgSearch(keyword, 1);
        return r.tracks.map((t) => ({
          name: t.name,
          singer: t.artist,
          source: 'kg',
          interval: t.duration,
          songId: t.meta.songId,
          hash: t.meta.hash,
          hash_320: t.meta.hash_320,
          hash_flac: t.meta.hash_flac,
          hash_high: t.meta.hash_high,
          albumId: t.meta.albumId,
          albumName: t.meta.albumName,
          _qualitys: t.meta._qualitys,
          qualitys: t.meta.qualitys,
        }));
      }
      case 'tx': {
        const r = await tx.txSearch(keyword, 1, 15);
        return r.tracks.map((t) => ({
          name: t.name,
          singer: t.artist,
          source: 'tx',
          interval: t.duration,
          songId: t.meta.songId,
          songmid: t.meta.songmid,
          mediaMid: t.meta.mediaMid,
          albumMid: t.meta.albumMid,
          albumName: t.meta.albumName,
        }));
      }
      case 'mg': {
        const r = await mg.mgSearch(keyword, 1, 15);
        return r.tracks.map((t) => ({
          name: t.name,
          singer: t.artist,
          source: 'mg',
          interval: t.duration,
          songId: t.meta.songId,
          copyrightId: t.meta.copyrightId,
          albumName: t.meta.albumName,
        }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/** 多级评分：歌名精确 > 歌手精确 > 时长接近 > 专辑 > 包含关系 */
export function scoreMusicMatch(
  item: {
    fMusicName: string;
    fSinger: string;
    fAlbumName: string;
    fInterval: number;
  },
  target: {
    fMusicName: string;
    fSinger: string;
    fAlbumName: string;
    fInterval: number;
  },
): number {
  let score = 0;
  if (!item.fMusicName || !target.fMusicName) return 0;

  if (item.fMusicName === target.fMusicName) score += 100;
  else if (
    target.fMusicName.includes(item.fMusicName) ||
    item.fMusicName.includes(target.fMusicName)
  ) {
    score += 40;
  } else {
    return 0;
  }

  if (target.fSinger) {
    if (item.fSinger === target.fSinger) score += 50;
    else if (
      target.fSinger.includes(item.fSinger) ||
      item.fSinger.includes(target.fSinger)
    ) {
      score += 20;
    }
  } else {
    score += 10;
  }

  if (target.fInterval > 0 && item.fInterval > 0) {
    const delta = Math.abs(target.fInterval - item.fInterval);
    if (delta < 2) score += 30;
    else if (delta < 5) score += 18;
    else if (delta < 12) score += 6;
  }

  if (target.fAlbumName) {
    if (item.fAlbumName === target.fAlbumName) score += 25;
    else if (
      item.fAlbumName &&
      (target.fAlbumName.includes(item.fAlbumName) ||
        item.fAlbumName.includes(target.fAlbumName))
    ) {
      score += 10;
    }
  }

  return score;
}

function pickBestFromSource(
  enriched: EnrichedHit[],
  target: {
    fMusicName: string;
    fSinger: string;
    fAlbumName: string;
    fInterval: number;
  },
): EnrichedHit | null {
  let best: EnrichedHit | null = null;
  let bestScore = 0;
  for (const item of enriched) {
    const score = scoreMusicMatch(item, target);
    if (score <= 0) continue;
    item._matchScore = score;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  // 最低门槛：至少歌名命中
  return bestScore >= 40 ? best : null;
}

function pickLegacyFromSource(
  enriched: EnrichedHit[],
  target: {
    fMusicName: string;
    fSinger: string;
    fAlbumName: string;
    fInterval: number;
  },
): EnrichedHit | null {
  const isEqualsInterval = (intv: number) =>
    Math.abs((target.fInterval || intv) - (intv || target.fInterval)) < 5;
  const isIncludesName = (n: string) =>
    target.fMusicName.includes(n) || n.includes(target.fMusicName);
  const isIncludesSinger = (s: string) =>
    target.fSinger ? target.fSinger.includes(s) || s.includes(target.fSinger) : true;
  const isEqualsAlbum = (album: string) =>
    target.fAlbumName ? target.fAlbumName === album : true;

  for (const item of enriched) {
    if (!isEqualsInterval(item.fInterval)) continue;
    if (item.fMusicName === target.fMusicName && isIncludesSinger(item.fSinger)) {
      item._matchScore = 0;
      return item;
    }
  }
  for (const item of enriched) {
    if (item.fSinger === target.fSinger && isIncludesName(item.fMusicName)) {
      item._matchScore = 0;
      return item;
    }
  }
  for (const item of enriched) {
    if (
      isEqualsAlbum(item.fAlbumName) &&
      isIncludesSinger(item.fSinger) &&
      isIncludesName(item.fMusicName)
    ) {
      item._matchScore = 0;
      return item;
    }
  }
  return null;
}

export async function findMusic(track: AudioTrack): Promise<AudioTrack[]> {
  const name = track.name;
  const singer = track.artist;
  const albumName = String(track.meta.albumName ?? '');
  const interval = track.duration;
  const exclude = track.source;
  const { getMusicSettings } = await import('@/lib/media/audio/music-settings');
  const useScore = getMusicSettings().findMusicScoredMatch !== false;

  const target = {
    fMusicName: filterStr(name).toLowerCase(),
    fSinger: filterStr(sortSingle(singer)).toLowerCase(),
    fAlbumName: filterStr(albumName).toLowerCase(),
    fInterval: getIntv(interval),
  };

  const tasks = SOURCES.filter((s) => s !== exclude).map(async (source) => {
    const list = await searchSource(source, name, singer);
    const enriched: EnrichedHit[] = list.map((item) => ({
      ...item,
      fSinger: filterStr(sortSingle(String(item.singer ?? '')).toLowerCase()),
      fMusicName: filterStr(String(item.name ?? '').toLowerCase()),
      fAlbumName: filterStr(String(item.albumName ?? '').toLowerCase()),
      fInterval: getIntv(String(item.interval ?? '')),
    }));
    return useScore
      ? pickBestFromSource(enriched, target)
      : pickLegacyFromSource(enriched, target);
  });

  const results = await Promise.all(tasks);
  const hits = results.filter((t): t is EnrichedHit => Boolean(t));
  const ordered = useScore
    ? hits.sort((a, b) => (b._matchScore ?? 0) - (a._matchScore ?? 0))
    : hits;

  const seen = new Set<string>();
  const out: AudioTrack[] = [];
  for (const item of ordered) {
    const t = mapEnrichedHitToTrack(item);
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
