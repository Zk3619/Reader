/**
 * 音乐 Hub 搜索配置（搜索页 / 我的列表共用）
 * 范围：歌名/歌手/专辑（可多选、可全不选）
 * 模式：常规 / 精准 / 模糊（互斥，至少一项）
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { continuousContains } from '@/lib/search/search-match';
import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';

export type MusicQueryScope = 'name' | 'artist' | 'album';
export type MusicQueryMode = 'normal' | 'precise' | 'fuzzy';

export type MusicQueryPrefs = {
  scopes: MusicQueryScope[];
  mode: MusicQueryMode;
};

const STORAGE_KEY = 'reader_music_query_prefs_v1';

export const DEFAULT_MUSIC_QUERY_PREFS: MusicQueryPrefs = {
  scopes: ['name', 'artist', 'album'],
  mode: 'normal',
};

function normalizePrefs(raw: unknown): MusicQueryPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scopesRaw = Array.isArray(obj.scopes) ? obj.scopes : DEFAULT_MUSIC_QUERY_PREFS.scopes;
  const scopes = scopesRaw.filter(
    (s): s is MusicQueryScope => s === 'name' || s === 'artist' || s === 'album',
  );
  const mode: MusicQueryMode =
    obj.mode === 'precise' || obj.mode === 'fuzzy' || obj.mode === 'normal'
      ? obj.mode
      : 'normal';
  return { scopes, mode };
}

function readStored(): MusicQueryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MUSIC_QUERY_PREFS };
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MUSIC_QUERY_PREFS };
  }
}

const [prefs, setPrefs] = createStore<MusicQueryPrefs>(readStored());

export function getMusicQueryPrefs(): MusicQueryPrefs {
  return prefs;
}

export function setMusicQueryPrefs(next: MusicQueryPrefs): void {
  const normalized = normalizePrefs(next);
  // 模式必须有效；若非法则强制 normal
  const mode = normalized.mode || 'normal';
  setPrefs({ scopes: normalized.scopes, mode });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scopes: normalized.scopes, mode }));
  } catch {
    // ignore
  }
}

export function musicQueryPrefsEqual(a: MusicQueryPrefs, b: MusicQueryPrefs): boolean {
  if (a.mode !== b.mode) return false;
  if (a.scopes.length !== b.scopes.length) return false;
  const sa = [...a.scopes].sort().join(',');
  const sb = [...b.scopes].sort().join(',');
  return sa === sb;
}

function trackAlbum(track: AudioTrack): string {
  return String(track.meta.albumName ?? '').trim();
}

function fieldTexts(track: AudioTrack, scopes: MusicQueryScope[]): string[] {
  // 未勾选任何范围：视为三个字段都参与（避免无意义空结果）
  const active: MusicQueryScope[] =
    scopes.length > 0 ? scopes : ['name', 'artist', 'album'];
  const out: string[] = [];
  for (const s of active) {
    if (s === 'name') out.push(track.name ?? '');
    else if (s === 'artist') out.push(track.artist ?? '');
    else out.push(trackAlbum(track));
  }
  return out;
}

/** 常规模式：不过滤，原样返回 API/列表数据 */
export function filterTracksByMusicQuery(
  tracks: AudioTrack[],
  keyword: string,
  queryPrefs: MusicQueryPrefs = getMusicQueryPrefs(),
): AudioTrack[] {
  if (queryPrefs.mode === 'normal') return tracks;
  const key = keyword.trim();
  if (!key) return tracks;

  return tracks.filter((track) => {
    const fields = fieldTexts(track, queryPrefs.scopes);
    if (queryPrefs.mode === 'precise') {
      return fields.some((f) => continuousContains(f, key));
    }
    // fuzzy
    return fields.some((f) => fuzzyMatchQuery(key, f));
  });
}

export function filterPlaylistsByMusicQuery<T extends { name: string; creator?: string }>(
  playlists: T[],
  keyword: string,
  queryPrefs: MusicQueryPrefs = getMusicQueryPrefs(),
): T[] {
  if (queryPrefs.mode === 'normal') return playlists;
  const key = keyword.trim();
  if (!key) return playlists;
  return playlists.filter((pl) => {
    const fields = [pl.name, pl.creator ?? ''];
    // 歌单无专辑字段；范围仅 name 时只对 name；未勾选时用 name+creator
    const scopes = queryPrefs.scopes;
    const useName = scopes.length === 0 || scopes.includes('name');
    const useArtist = scopes.length === 0 || scopes.includes('artist');
    const candidates: string[] = [];
    if (useName) candidates.push(fields[0]!);
    if (useArtist) candidates.push(fields[1]!);
    if (candidates.length === 0) candidates.push(...fields);
    if (queryPrefs.mode === 'precise') {
      return candidates.some((f) => continuousContains(f, key));
    }
    return candidates.some((f) => fuzzyMatchQuery(key, f));
  });
}
