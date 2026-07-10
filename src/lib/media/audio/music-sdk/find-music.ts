/**
 * 跨源智能匹配（对齐 lx-music musicSdk.findMusic）
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

function mapEnrichedHitToTrack(item: Record<string, unknown>): AudioTrack {
  return mapHitToTrack({
    name: String(item.name ?? ''),
    singer: String(item.singer ?? ''),
    source: String(item.source ?? ''),
    interval: String(item.interval ?? ''),
    songmid: item.songmid != null ? String(item.songmid) : undefined,
    songId: item.songId != null ? String(item.songId) : undefined,
    hash: item.hash != null ? String(item.hash) : undefined,
    copyrightId: item.copyrightId != null ? String(item.copyrightId) : undefined,
    albumName: item.albumName != null ? String(item.albumName) : undefined,
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
  copyrightId?: string;
  albumName?: string;
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
      copyrightId: hit.copyrightId,
      albumName: hit.albumName,
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
          albumName: t.meta.albumName,
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

export async function findMusic(track: AudioTrack): Promise<AudioTrack[]> {
  const name = track.name;
  const singer = track.artist;
  const albumName = String(track.meta.albumName ?? '');
  const interval = track.duration;
  const exclude = track.source;

  const fMusicName = filterStr(name).toLowerCase();
  const fSinger = filterStr(sortSingle(singer)).toLowerCase();
  const fAlbumName = filterStr(albumName).toLowerCase();
  const fInterval = getIntv(interval);

  const isEqualsInterval = (intv: number) =>
    Math.abs((fInterval || intv) - (intv || fInterval)) < 5;
  const isIncludesName = (n: string) => fMusicName.includes(n) || n.includes(fMusicName);
  const isIncludesSinger = (s: string) =>
    fSinger ? fSinger.includes(s) || s.includes(fSinger) : true;
  const isEqualsAlbum = (album: string) => (fAlbumName ? fAlbumName === album : true);

  const tasks = SOURCES.filter((s) => s !== exclude).map(async (source) => {
    const list = await searchSource(source, name, singer);
    const enriched = list.map((item) => ({
      ...item,
      fSinger: filterStr(sortSingle(String(item.singer ?? '')).toLowerCase()),
      fMusicName: filterStr(String(item.name ?? '').toLowerCase()),
      fAlbumName: filterStr(String(item.albumName ?? '').toLowerCase()),
      fInterval: getIntv(String(item.interval ?? '')),
    }));

    for (const item of enriched) {
      if (!isEqualsInterval(item.fInterval as number)) continue;
      if (item.fMusicName === fMusicName && isIncludesSinger(item.fSinger as string)) {
        return mapEnrichedHitToTrack(item);
      }
    }
    for (const item of enriched) {
      if (item.fSinger === fSinger && isIncludesName(item.fMusicName as string)) {
        return mapEnrichedHitToTrack(item);
      }
    }
    for (const item of enriched) {
      if (
        isEqualsAlbum(item.fAlbumName as string) &&
        isIncludesSinger(item.fSinger as string) &&
        isIncludesName(item.fMusicName as string)
      ) {
        return mapEnrichedHitToTrack(item);
      }
    }
    return null;
  });

  const results = await Promise.all(tasks);
  const seen = new Set<string>();
  const out: AudioTrack[] = [];
  for (const t of results) {
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
