/**
 * MusicFree 插件生命周期与方法调用（独立于 user-api-engine）
 */

import { request } from '@/lib/http';
import {
  getMfAlternativePluginId,
  getMfPluginMeta,
  removeMfPluginMeta,
  setMfPluginMeta,
} from '@/lib/media/audio/online/mf-plugin/settings';
import {
  loadMfPluginCode,
  looksLikeMfPluginScript,
  type MfLoadedPlugin,
} from '@/lib/media/audio/online/mf-plugin/runtime';
import {
  lxQualityToMf,
  mfLyricToBundle,
  mfMusicItemToTrack,
  mfSheetToSummary,
  trackToMfMusicItem,
} from '@/lib/media/audio/online/mf-plugin/media-adapter';
import {
  mfSourceKey,
  parseMfPluginId,
  type MfAlbumItem,
  type MfArtistItem,
  type MfComment,
  type MfMediaSourceResult,
  type MfMusicItem,
  type MfPluginDefine,
  type MfPluginMethodName,
  type MfQualityKey,
  type MfSheetItem,
  type MfCacheControl,
  type MfSupportMediaType,
} from '@/lib/media/audio/online/mf-plugin/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { upsertAudioSource, deleteAudioSource } from '@/lib/database/audio-sources';

const STORAGE_KEY = 'reader_audio_mf_plugins';

export type MfPluginRecord = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  srcUrl?: string;
  script: string;
  hash: string;
  enabled: boolean;
  order: number;
  supportedMethods: MfPluginMethodName[];
  primaryKey?: string[];
  userVariableDefs?: MfPluginDefine['userVariables'];
  supportedSearchType?: MfSupportMediaType[];
  cacheControl?: MfCacheControl;
  createdAt: number;
  updatedAt: number;
};

type StoredPlugin = Omit<MfPluginRecord, 'supportedMethods'> & {
  supportedMethods?: MfPluginMethodName[];
};

const plugins = new Map<string, MfPluginRecord>();
const runtimeCache = new Map<string, MfLoadedPlugin>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function subscribeMfPlugins(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(): void {
  try {
    const list = [...plugins.values()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function hydrateFromStorage(): void {
  if (plugins.size > 0) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as StoredPlugin[];
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item?.id || !item.script) continue;
      const meta = getMfPluginMeta(item.id);
      plugins.set(item.id, {
        ...item,
        enabled: meta.enabled,
        order: meta.order || item.order || 0,
        supportedMethods: item.supportedMethods ?? [],
      });
    }
  } catch {
    // ignore
  }
}

hydrateFromStorage();

function ensureRuntime(plugin: MfPluginRecord): MfLoadedPlugin {
  const cached = runtimeCache.get(plugin.id);
  if (cached && cached.hash === plugin.hash) return cached;
  const loaded = loadMfPluginCode({
    code: plugin.script,
    pluginId: plugin.id,
  });
  runtimeCache.set(plugin.id, loaded);
  return loaded;
}

function syncDbRow(plugin: MfPluginRecord): void {
  void upsertAudioSource({
    id: `mf:${plugin.id}`,
    kind: 'mf_plugin',
    name: plugin.name,
    enabled: plugin.enabled,
    script: plugin.script,
    scriptUrl: plugin.srcUrl,
    version: plugin.version,
    customOrder: plugin.order,
    metaJson: JSON.stringify({
      hash: plugin.hash,
      supportedMethods: plugin.supportedMethods,
      author: plugin.author,
    }),
  }).catch(() => undefined);
}

export function listMfPlugins(): MfPluginRecord[] {
  hydrateFromStorage();
  return [...plugins.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function listEnabledMfPlugins(): MfPluginRecord[] {
  return listMfPlugins().filter((p) => p.enabled);
}

export function listMfSearchPlugins(): MfPluginRecord[] {
  return listEnabledMfPlugins().filter((p) => p.supportedMethods.includes('search'));
}

export function getMfPlugin(id: string): MfPluginRecord | null {
  hydrateFromStorage();
  return plugins.get(id) ?? null;
}

export function getMfPluginByPlatform(platform: string): MfPluginRecord | null {
  const name = platform.trim();
  if (!name) return null;
  return listMfPlugins().find((p) => p.name === name) ?? null;
}

export function pluginHasMethod(
  pluginId: string,
  method: MfPluginMethodName,
): boolean {
  const p = getMfPlugin(pluginId);
  return Boolean(p?.supportedMethods.includes(method));
}

function makeIdFromHash(hash: string): string {
  return hash.slice(0, 16);
}

export type ImportMfPluginResult = {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  name?: string;
  error?: string;
};

export async function importMfPlugin(input: {
  script: string;
  srcUrl?: string;
  fileName?: string;
  enable?: boolean;
}): Promise<ImportMfPluginResult> {
  try {
    if (!looksLikeMfPluginScript(input.script) && !/platform\s*:/.test(input.script)) {
      // 仍尝试加载；失败再报错
    }
    const tempId = `tmp_${Date.now()}`;
    const loaded = loadMfPluginCode({
      code: input.script,
      pluginId: tempId,
      path: input.fileName,
    });
    const id = makeIdFromHash(loaded.hash);
    const existing = [...plugins.values()].find(
      (p) => p.hash === loaded.hash || p.name === loaded.name,
    );
    if (existing && existing.hash === loaded.hash) {
      return { ok: true, skipped: true, id: existing.id, name: existing.name };
    }

    const now = Date.now();
    const order =
      existing?.order ??
      (listMfPlugins().reduce((m, p) => Math.max(m, p.order), 0) + 1);
    const enabled = input.enable !== false;
    const record: MfPluginRecord = {
      id: existing?.id ?? id,
      name: loaded.name,
      version: loaded.instance.version,
      author: loaded.instance.author,
      description: loaded.instance.description,
      srcUrl: input.srcUrl ?? loaded.instance.srcUrl,
      script: input.script,
      hash: loaded.hash,
      enabled,
      order,
      supportedMethods: loaded.supportedMethods,
      primaryKey: loaded.instance.primaryKey,
      userVariableDefs: loaded.instance.userVariables,
      supportedSearchType: loaded.instance.supportedSearchType,
      cacheControl: loaded.instance.cacheControl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // 同名升级：替换旧 id
    if (existing && existing.id !== record.id) {
      plugins.delete(existing.id);
      runtimeCache.delete(existing.id);
      removeMfPluginMeta(existing.id);
      void deleteAudioSource(`mf:${existing.id}`).catch(() => undefined);
    }

    setMfPluginMeta(record.id, { enabled, order });
    plugins.set(record.id, record);
    runtimeCache.set(record.id, {
      ...loaded,
    });
    // 用真实 id 重新加载，确保 env.getUserVariables 绑定正确
    runtimeCache.set(
      record.id,
      loadMfPluginCode({ code: record.script, pluginId: record.id }),
    );
    persist();
    syncDbRow(record);
    notify();
    return { ok: true, id: record.id, name: record.name };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function importMfPluginFromUrl(url: string): Promise<ImportMfPluginResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: 'URL 为空' };
  try {
    // 订阅源 plugins.json
    if (/plugins\.json(\?|$)/i.test(trimmed) || trimmed.endsWith('/')) {
      const res = await request(trimmed, {
        method: 'GET',
        timeout: 30_000,
        useBackendHttp: true,
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // 不是 JSON，当作单个插件脚本
        return importMfPlugin({ script: text, srcUrl: trimmed });
      }
      const urls = extractPluginUrls(parsed);
      if (urls.length === 0) return { ok: false, error: '订阅源无插件 URL' };
      let last: ImportMfPluginResult = { ok: false, error: '未导入任何插件' };
      let okCount = 0;
      for (const u of urls) {
        last = await importMfPluginFromUrl(u);
        if (last.ok && !last.skipped) okCount += 1;
      }
      return {
        ok: okCount > 0 || Boolean(last.ok),
        name: `订阅源（${okCount}）`,
        error: okCount === 0 ? last.error : undefined,
      };
    }

    const res = await request(trimmed, {
      method: 'GET',
      timeout: 30_000,
      useBackendHttp: true,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const script = await res.text();
    return importMfPlugin({ script, srcUrl: trimmed });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractPluginUrls(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'url' in item) {
          return String((item as { url: unknown }).url ?? '');
        }
        if (item && typeof item === 'object' && 'srcUrl' in item) {
          return String((item as { srcUrl: unknown }).srcUrl ?? '');
        }
        return '';
      })
      .filter((u) => /^https?:\/\//i.test(u));
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { plugins?: unknown }).plugins)) {
    return extractPluginUrls((parsed as { plugins: unknown[] }).plugins);
  }
  return [];
}

export function setMfPluginEnabled(id: string, enabled: boolean): void {
  const p = plugins.get(id);
  if (!p) return;
  p.enabled = enabled;
  p.updatedAt = Date.now();
  setMfPluginMeta(id, { enabled });
  persist();
  syncDbRow(p);
  notify();
}

export function removeMfPlugin(id: string): void {
  if (!plugins.has(id)) return;
  plugins.delete(id);
  runtimeCache.delete(id);
  removeMfPluginMeta(id);
  persist();
  void deleteAudioSource(`mf:${id}`).catch(() => undefined);
  notify();
}

export function reorderMfPlugin(id: string, order: number): void {
  const p = plugins.get(id);
  if (!p) return;
  p.order = order;
  setMfPluginMeta(id, { order });
  persist();
  syncDbRow(p);
  notify();
}

async function withInstance<T>(
  pluginId: string,
  fn: (instance: MfPluginDefine, record: MfPluginRecord) => Promise<T>,
): Promise<T> {
  const record = getMfPlugin(pluginId);
  if (!record) throw new Error(`插件不存在: ${pluginId}`);
  if (!record.enabled) throw new Error(`插件已禁用: ${record.name}`);
  const loaded = ensureRuntime(record);
  return fn(loaded.instance, record);
}

export async function mfSearch(
  pluginId: string,
  keyword: string,
  page = 1,
  type: MfSupportMediaType = 'music',
): Promise<{ tracks: AudioTrack[]; total: number; isEnd: boolean }> {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.search !== 'function') {
      return { tracks: [], total: 0, isEnd: true };
    }
    const result = await instance.search(keyword, page, type);
    const data = Array.isArray(result?.data) ? result!.data : [];
    if (type === 'music') {
      const tracks = (data as MfMusicItem[]).map((item) => {
        const normalized = { ...item, platform: item.platform || record.name };
        return mfMusicItemToTrack(normalized, record.id, {
          primaryKey: record.primaryKey,
        });
      });
      return {
        tracks,
        total: tracks.length,
        isEnd: result?.isEnd !== false,
      };
    }
    if (type === 'lyric') {
      const tracks = (data as MfMusicItem[]).map((item) => {
        const normalized = { ...item, platform: item.platform || record.name };
        return mfMusicItemToTrack(normalized, record.id, {
          primaryKey: record.primaryKey,
        });
      });
      return {
        tracks,
        total: tracks.length,
        isEnd: result?.isEnd !== false,
        raw: data,
      };
    }
    return {
      tracks: [],
      total: data.length,
      isEnd: result?.isEnd !== false,
      raw: data,
    };
  });
}

export async function mfGetMediaSource(
  pluginId: string,
  track: AudioTrack,
  quality?: MusicQuality | MfQualityKey,
): Promise<MfMediaSourceResult | null> {
  const altId = getMfAlternativePluginId(pluginId);
  const resolveId = altId && getMfPlugin(altId)?.enabled ? altId : pluginId;
  return withInstance(resolveId, async (instance) => {
    if (typeof instance.getMediaSource !== 'function') return null;
    const item = trackToMfMusicItem(track);
    const q = lxQualityToMf(quality as MusicQuality);
    return instance.getMediaSource(item, q);
  });
}

export async function mfGetLyric(
  pluginId: string,
  track: AudioTrack,
): Promise<LyricBundle | null> {
  return withInstance(pluginId, async (instance) => {
    if (typeof instance.getLyric !== 'function') return null;
    const item = trackToMfMusicItem(track);
    const lyric = await instance.getLyric(item);
    return mfLyricToBundle(lyric);
  });
}

export async function mfGetMusicSheetInfo(
  pluginId: string,
  sheet: MfSheetItem,
  page = 1,
): Promise<{ tracks: AudioTrack[]; isEnd: boolean; sheet?: MfSheetItem }> {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getMusicSheetInfo !== 'function') {
      return { tracks: [], isEnd: true };
    }
    const result = await instance.getMusicSheetInfo(sheet, page);
    const list = Array.isArray(result?.musicList) ? result!.musicList! : [];
    const tracks = list.map((item) =>
      mfMusicItemToTrack(
        { ...item, platform: item.platform || record.name },
        record.id,
        { primaryKey: record.primaryKey },
      ),
    );
    return {
      tracks,
      isEnd: result?.isEnd !== false,
      sheet: result?.sheetItem,
    };
  });
}

export async function mfGetTopLists(pluginId: string) {
  return withInstance(pluginId, async (instance) => {
    if (typeof instance.getTopLists !== 'function') return [];
    return (await instance.getTopLists()) ?? [];
  });
}

export async function mfGetTopListDetail(
  pluginId: string,
  topListItem: MfSheetItem,
  page = 1,
) {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getTopListDetail !== 'function') {
      return { tracks: [] as AudioTrack[], isEnd: true };
    }
    const result = await instance.getTopListDetail(topListItem, page);
    const list = Array.isArray(result?.musicList) ? result!.musicList! : [];
    return {
      tracks: list.map((item) =>
        mfMusicItemToTrack(
          { ...item, platform: item.platform || record.name },
          record.id,
          { primaryKey: record.primaryKey },
        ),
      ),
      isEnd: result?.isEnd !== false,
      topListItem: result?.topListItem,
    };
  });
}

export async function mfGetRecommendSheetTags(pluginId: string) {
  return withInstance(pluginId, async (instance) => {
    if (typeof instance.getRecommendSheetTags !== 'function') {
      return { pinned: [], data: [] };
    }
    return (await instance.getRecommendSheetTags()) ?? { pinned: [], data: [] };
  });
}

export async function mfGetRecommendSheetsByTag(
  pluginId: string,
  tag: { id: string },
  page = 1,
) {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getRecommendSheetsByTag !== 'function') {
      return { isEnd: true, list: [] as ReturnType<typeof mfSheetToSummary>[] };
    }
    const result = await instance.getRecommendSheetsByTag(tag, page);
    const data = Array.isArray(result?.data) ? result!.data! : [];
    return {
      isEnd: result?.isEnd !== false,
      list: data.map((s) => mfSheetToSummary(s, record.id)),
    };
  });
}

export async function mfGetAlbumInfo(
  pluginId: string,
  album: MfAlbumItem,
  page = 1,
) {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getAlbumInfo !== 'function') {
      return { tracks: [] as AudioTrack[], isEnd: true };
    }
    const result = await instance.getAlbumInfo(album, page);
    const list = Array.isArray(result?.musicList) ? result!.musicList! : [];
    return {
      tracks: list.map((item) =>
        mfMusicItemToTrack(
          { ...item, platform: item.platform || record.name },
          record.id,
          { primaryKey: record.primaryKey },
        ),
      ),
      isEnd: result?.isEnd !== false,
      albumItem: result?.albumItem,
    };
  });
}

export async function mfGetArtistWorks(
  pluginId: string,
  artist: MfArtistItem,
  page = 1,
  type: MfSupportMediaType = 'music',
) {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getArtistWorks !== 'function') {
      return { tracks: [] as AudioTrack[], isEnd: true };
    }
    const result = await instance.getArtistWorks(artist, page, type);
    const data = Array.isArray(result?.data) ? result!.data : [];
    if (type !== 'music') {
      return { tracks: [], isEnd: result?.isEnd !== false, raw: data };
    }
    return {
      tracks: (data as MfMusicItem[]).map((item) =>
        mfMusicItemToTrack(
          { ...item, platform: item.platform || record.name },
          record.id,
          { primaryKey: record.primaryKey },
        ),
      ),
      isEnd: result?.isEnd !== false,
    };
  });
}

export async function mfGetMusicComments(
  pluginId: string,
  track: AudioTrack,
  page = 1,
): Promise<{ isEnd: boolean; data: MfComment[] }> {
  return withInstance(pluginId, async (instance) => {
    if (typeof instance.getMusicComments !== 'function') {
      return { isEnd: true, data: [] };
    }
    const result = await instance.getMusicComments(trackToMfMusicItem(track), page);
    return {
      isEnd: result?.isEnd !== false,
      data: Array.isArray(result?.data) ? result!.data! : [],
    };
  });
}

export async function mfImportMusicSheet(pluginId: string, urlLike: string) {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.importMusicSheet !== 'function') return [] as AudioTrack[];
    const list = (await instance.importMusicSheet(urlLike)) ?? [];
    return list.map((item) =>
      mfMusicItemToTrack(
        { ...item, platform: item.platform || record.name },
        record.id,
        { primaryKey: record.primaryKey },
      ),
    );
  });
}

export async function mfImportMusicItem(
  pluginId: string,
  urlLike: string,
): Promise<AudioTrack | null> {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.importMusicItem !== 'function') return null;
    const item = await instance.importMusicItem(urlLike);
    if (!item) return null;
    return mfMusicItemToTrack(
      { ...item, platform: item.platform || record.name },
      record.id,
      { primaryKey: record.primaryKey },
    );
  });
}

export async function mfImportMusicItemWithAnyPlugin(
  urlLike: string,
): Promise<AudioTrack | null> {
  for (const p of listEnabledMfPlugins()) {
    if (!p.supportedMethods.includes('importMusicItem')) continue;
    try {
      const track = await mfImportMusicItem(p.id, urlLike);
      if (track) return track;
    } catch {
      // try next
    }
  }
  return null;
}

export async function mfGetMusicInfo(
  pluginId: string,
  track: AudioTrack,
): Promise<AudioTrack | null> {
  return withInstance(pluginId, async (instance, record) => {
    if (typeof instance.getMusicInfo !== 'function') return null;
    const item = trackToMfMusicItem(track);
    const patch = await instance.getMusicInfo(item);
    if (!patch || typeof patch !== 'object') return null;
    const merged = { ...item, ...patch, platform: item.platform || record.name };
    return mfMusicItemToTrack(merged, record.id, { primaryKey: record.primaryKey });
  });
}

export async function enrichTrackWithMfMusicInfo(track: AudioTrack): Promise<AudioTrack> {
  const pluginId =
    parseMfPluginId(String(track.source)) ||
    (typeof track.meta.mfPluginId === 'string' ? track.meta.mfPluginId : null);
  if (!pluginId || !pluginHasMethod(pluginId, 'getMusicInfo')) return track;
  try {
    const enriched = await mfGetMusicInfo(pluginId, track);
    if (!enriched) return track;
    return {
      ...track,
      name: enriched.name || track.name,
      artist: enriched.artist || track.artist,
      duration: enriched.duration || track.duration,
      meta: {
        ...track.meta,
        ...enriched.meta,
        mfMusicItem: enriched.meta.mfMusicItem ?? track.meta.mfMusicItem,
      },
    };
  } catch {
    return track;
  }
}

export function reorderMfPlugins(idsInOrder: string[]): void {
  idsInOrder.forEach((id, index) => reorderMfPlugin(id, index + 1));
}

export function mfPluginDisplayLabel(pluginId: string): string {
  return getMfPlugin(pluginId)?.name ?? pluginId;
}

export function mfTrackSourceKey(pluginId: string): string {
  return mfSourceKey(pluginId);
}

export { looksLikeMfPluginScript } from '@/lib/media/audio/online/mf-plugin/runtime';
export * from '@/lib/media/audio/online/mf-plugin/browse';
