/**
 * 音乐 Hub 搜索配置：范围（多选可空）+ 模式（单选必有）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';

export type MusicSearchScopeField = 'name' | 'artist' | 'album';
export type MusicSearchQueryMode = 'normal' | 'precise' | 'fuzzy';

export type MusicSearchQueryConfig = {
  /** 搜索范围；可全不勾选（过滤时视为三项全开） */
  scopes: MusicSearchScopeField[];
  /** 搜索模式：常规=不过滤；精准/模糊=客户端过滤 */
  mode: MusicSearchQueryMode;
};

export const DEFAULT_MUSIC_SEARCH_QUERY_CONFIG: MusicSearchQueryConfig = {
  scopes: ['name', 'artist', 'album'],
  mode: 'normal',
};

const STORAGE_ONLINE = 'reader_music_online_search_query_v1';
const STORAGE_LIST = 'reader_music_list_search_query_v1';

function readConfig(key: string): MusicSearchQueryConfig {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_MUSIC_SEARCH_QUERY_CONFIG, scopes: [...DEFAULT_MUSIC_SEARCH_QUERY_CONFIG.scopes] };
    const parsed = JSON.parse(raw) as Partial<MusicSearchQueryConfig>;
    return normalizeConfig(parsed);
  } catch {
    return { ...DEFAULT_MUSIC_SEARCH_QUERY_CONFIG, scopes: [...DEFAULT_MUSIC_SEARCH_QUERY_CONFIG.scopes] };
  }
}

function writeConfig(key: string, config: MusicSearchQueryConfig): void {
  try {
    localStorage.setItem(key, JSON.stringify(normalizeConfig(config)));
  } catch {
    // ignore
  }
}

export function normalizeConfig(input: Partial<MusicSearchQueryConfig> | null | undefined): MusicSearchQueryConfig {
  const scopesRaw = Array.isArray(input?.scopes) ? input!.scopes : [];
  const scopes = scopesRaw.filter(
    (s): s is MusicSearchScopeField => s === 'name' || s === 'artist' || s === 'album',
  );
  const mode: MusicSearchQueryMode =
    input?.mode === 'precise' || input?.mode === 'fuzzy' || input?.mode === 'normal'
      ? input.mode
      : 'normal';
  return { scopes, mode };
}

export function configEquals(a: MusicSearchQueryConfig, b: MusicSearchQueryConfig): boolean {
  const na = normalizeConfig(a);
  const nb = normalizeConfig(b);
  if (na.mode !== nb.mode) return false;
  const sa = [...na.scopes].sort().join(',');
  const sb = [...nb.scopes].sort().join(',');
  return sa === sb;
}

export function cloneConfig(c: MusicSearchQueryConfig): MusicSearchQueryConfig {
  const n = normalizeConfig(c);
  return { mode: n.mode, scopes: [...n.scopes] };
}

export function getOnlineMusicSearchQueryConfig(): MusicSearchQueryConfig {
  return readConfig(STORAGE_ONLINE);
}

export function setOnlineMusicSearchQueryConfig(config: MusicSearchQueryConfig): void {
  writeConfig(STORAGE_ONLINE, config);
}

export function getListMusicSearchQueryConfig(): MusicSearchQueryConfig {
  return readConfig(STORAGE_LIST);
}

export function setListMusicSearchQueryConfig(config: MusicSearchQueryConfig): void {
  writeConfig(STORAGE_LIST, config);
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function trackAlbum(track: AudioTrack): string {
  return String(track.meta.albumName ?? '').trim();
}

function fieldValues(track: AudioTrack, scopes: MusicSearchScopeField[]): string[] {
  const effective =
    scopes.length > 0 ? scopes : (['name', 'artist', 'album'] as MusicSearchScopeField[]);
  const out: string[] = [];
  for (const s of effective) {
    if (s === 'name') out.push(track.name ?? '');
    else if (s === 'artist') out.push(track.artist ?? '');
    else out.push(trackAlbum(track));
  }
  return out.map((x) => x.trim()).filter(Boolean);
}

function matchPrecise(haystack: string, needle: string): boolean {
  return normalizeText(haystack) === normalizeText(needle);
}

function matchFuzzy(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return true;
  if (h.includes(n)) return true;
  // 连续子序列模糊（对齐书架 fuzzy 简化版）
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i >= n.length) return true;
  }
  return false;
}

/** 常规模式：原样返回；精准/模糊：按范围过滤 */
export function filterTracksByMusicSearchQuery(
  tracks: AudioTrack[],
  keyword: string,
  config: MusicSearchQueryConfig,
): AudioTrack[] {
  const cfg = normalizeConfig(config);
  if (cfg.mode === 'normal') return tracks;
  const q = keyword.trim();
  if (!q) return tracks;
  return tracks.filter((t) => {
    const fields = fieldValues(t, cfg.scopes);
    if (fields.length === 0) return false;
    if (cfg.mode === 'precise') return fields.some((f) => matchPrecise(f, q));
    return fields.some((f) => matchFuzzy(f, q));
  });
}

/** 同样过滤歌单名/描述等简单文本项（在线歌单搜索） */
export function filterByTextFields(
  items: Array<{ name?: string; desc?: string; author?: string }>,
  keyword: string,
  config: MusicSearchQueryConfig,
  mapScopes: (item: { name?: string; desc?: string; author?: string }) => {
    name: string;
    artist: string;
    album: string;
  },
): typeof items {
  const cfg = normalizeConfig(config);
  if (cfg.mode === 'normal') return items;
  const q = keyword.trim();
  if (!q) return items;
  return items.filter((item) => {
    const mapped = mapScopes(item);
    const scopes =
      cfg.scopes.length > 0 ? cfg.scopes : (['name', 'artist', 'album'] as MusicSearchScopeField[]);
    const fields: string[] = [];
    for (const s of scopes) {
      if (s === 'name') fields.push(mapped.name);
      else if (s === 'artist') fields.push(mapped.artist);
      else fields.push(mapped.album);
    }
    const nonempty = fields.map((x) => x.trim()).filter(Boolean);
    if (!nonempty.length) return false;
    if (cfg.mode === 'precise') return nonempty.some((f) => matchPrecise(f, q));
    return nonempty.some((f) => matchFuzzy(f, q));
  });
}
