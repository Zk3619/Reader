/**
 * UserApi 自定义源引擎（LX 兼容 API）
 */

import { initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { injectBrowserLegadoShims } from '@/lib/js-engine/legado/host/browser-shim-vm';
import { injectLegadoEncodingUtils } from '@/lib/js-engine/legado/host/encode-vm';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  getDefaultUserApiId,
  setDefaultUserApiId,
} from '@/lib/media/audio/online/user-api-settings';
import {
  isHandlerOnlyUserApiScript,
  isLxUserApiScript,
  loadLxUserApiScript,
  parseLxScriptHeaderMeta,
  type LxRequestPayload,
} from '@/lib/media/audio/online/lx-user-api-shim';

export { getDefaultUserApiId, setDefaultUserApiId };

/** 给默认音源打分：直连平台源优先，第三方聚合代理靠后 */
export function scoreUserApiScript(s: { name: string; script: string }): number {
  const text = `${s.name}\n${s.script.slice(0, 4000)}`;
  let score = 0;
  if (/小熊猫|lx-music-source|Free listen/i.test(text)) score += 100;
  if (/interface3\.music\.163\.com|kuwo\.cn\/api\/v1\/www\/music\/playUrl/i.test(text)) {
    score += 50;
  }
  if (/cenguigui\.cn|hhlqilongzhu\.cn|97\.64\.37\.235/i.test(text)) score -= 100;
  if (/聚合API|野草|野花/i.test(s.name)) score -= 40;
  return score;
}

/** 官方小熊猫一类：直连平台，应对齐 lx-music 优先走脚本 */
export function isDirectPlatformUserApi(scriptId: string | null | undefined): boolean {
  if (!scriptId) return false;
  const s = scripts.get(scriptId);
  return !!s && scoreUserApiScript(s) >= 50;
}

/** 依赖第三方聚合代理的脚本：失败才熔断，避免拖垮直连源 */
export function isFragileUserApi(scriptId: string | null | undefined): boolean {
  if (!scriptId) return true;
  const s = scripts.get(scriptId);
  return !s || scoreUserApiScript(s) < 0;
}

export type UserApiAction =
  | 'musicUrl'
  | 'lyric'
  | 'pic'
  | 'search'
  | 'songList'
  | 'leaderboard';

export interface UserApiScript {
  id: string;
  name: string;
  /** 脚本 @version */
  version?: string;
  /** 脚本源码 */
  script: string;
  enabled: boolean;
  /** 初始化状态：添加音源或设置页校验时更新 */
  initStatus?: 'pending' | 'ready' | 'failed';
  initError?: string;
}

const scripts = new Map<string, UserApiScript>();
const lxRuntimeCache = new Map<
  string,
  Awaited<ReturnType<typeof loadLxUserApiScript>>
>();
const STORAGE_KEY = 'reader_audio_user_api_scripts';
const scriptListeners = new Set<() => void>();

function notifyScriptsChanged(): void {
  for (const fn of scriptListeners) fn();
}

export function subscribeUserApiScripts(listener: () => void): () => void {
  scriptListeners.add(listener);
  return () => scriptListeners.delete(listener);
}

function isUserApiInitReady(script: UserApiScript): boolean {
  return script.initStatus === 'ready';
}

function applyScriptHeaderMeta(script: UserApiScript): UserApiScript {
  const headerMeta = parseLxScriptHeaderMeta(script.script);
  return {
    ...script,
    name: headerMeta.name ?? script.name,
    version: headerMeta.version ?? script.version,
  };
}

function patchUserApiScript(id: string, patch: Partial<UserApiScript>): UserApiScript | null {
  const script = scripts.get(id);
  if (!script) return null;
  const next = { ...script, ...patch };
  scripts.set(id, next);
  persistScripts();
  notifyScriptsChanged();
  return next;
}

function loadScriptsFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as UserApiScript[];
    for (const s of list) {
      const initStatus = s.initStatus ?? 'pending';
      scripts.set(
        s.id,
        applyScriptHeaderMeta({
          ...s,
          initStatus,
          initError: s.initError,
          enabled: initStatus === 'ready' ? s.enabled : false,
        }),
      );
    }
    const defaultId = getDefaultUserApiId();
    if (defaultId) {
      const current = scripts.get(defaultId);
      if (!current || !isUserApiInitReady(current)) {
        setDefaultUserApiId(null);
      }
    }
    // 若当前默认是聚合代理等低分源，且存在小熊猫等高分直连源，自动切过去
    const ranked = [...scripts.values()]
      .filter((s) => s.enabled && isUserApiInitReady(s))
      .sort((a, b) => scoreUserApiScript(b) - scoreUserApiScript(a));
    const best = ranked[0];
    if (best) {
      const curId = getDefaultUserApiId();
      const cur = curId ? scripts.get(curId) : null;
      if (!cur || scoreUserApiScript(cur) < scoreUserApiScript(best) - 30) {
        setDefaultUserApiId(best.id);
      }
    }
  } catch {
    // ignore
  }
}

function persistScripts(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...scripts.values()]));
  } catch {
    // ignore
  }
}

loadScriptsFromStorage();

export function isHandlerUserApiScript(script: string): boolean {
  return isHandlerOnlyUserApiScript(script);
}

export function registerUserApiScript(script: UserApiScript): void {
  const normalized = applyScriptHeaderMeta({
    ...script,
    enabled: false,
    initStatus: script.initStatus ?? 'pending',
    initError: script.initError,
  });
  scripts.set(normalized.id, normalized);
  lxRuntimeCache.delete(normalized.id);
  persistScripts();
  notifyScriptsChanged();
}

/** 执行 UserApi 脚本初始化（LX 脚本走 loadLxUserApiScript） */
export async function initUserApiScript(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const script = scripts.get(id);
  if (!script) return { ok: false, error: '脚本不存在' };

  patchUserApiScript(id, { initStatus: 'pending', initError: undefined });

  try {
    if (isLxUserApiScript(script.script)) {
      lxRuntimeCache.delete(id);
      const runtime = await loadLxUserApiScript(script);
      lxRuntimeCache.set(id, runtime);
    } else {
      await initQuickJSRuntime();
    }
    patchUserApiScript(id, { initStatus: 'ready', initError: undefined });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lxRuntimeCache.delete(id);
    patchUserApiScript(id, {
      initStatus: 'failed',
      initError: error,
      enabled: false,
    });
    if (getDefaultUserApiId() === id) setDefaultUserApiId(null);
    return { ok: false, error };
  }
}

/** 导入并初始化音源；初始化失败时不启用 */
export async function importUserApiScript(input: {
  script: string;
  fileName?: string;
  fallbackName?: string;
}): Promise<{ id: string; name: string; ok: boolean; error?: string }> {
  const headerMeta = parseLxScriptHeaderMeta(input.script);
  const id = `userapi_${Date.now()}`;
  const name =
    headerMeta.name ??
    (input.fallbackName?.trim() ||
      input.fileName?.replace(/\.[^.]+$/, '') ||
      '未命名音源');

  registerUserApiScript({
    id,
    name,
    script: input.script,
    enabled: false,
    initStatus: 'pending',
  });

  const result = await initUserApiScript(id);
  if (!result.ok) {
    return { id, name, ok: false, error: result.error };
  }

  const hasEnabled = listUserApiScripts().some((s) => s.id !== id && s.enabled);
  if (!hasEnabled) {
    setUserApiScriptEnabled(id, true);
    if (!getDefaultUserApiId()) setDefaultUserApiId(id);
  }

  return { id, name, ok: true };
}

/** 设置页打开时补校验未就绪的已存脚本 */
export async function ensureUserApiScriptsInitialized(): Promise<void> {
  const pending = listUserApiScripts().filter(
    (s) => s.initStatus !== 'ready' && s.initStatus !== 'failed',
  );
  for (const script of pending) {
    await initUserApiScript(script.id);
  }
}

export function removeUserApiScript(id: string): void {
  scripts.delete(id);
  lxRuntimeCache.delete(id);
  if (getDefaultUserApiId() === id) setDefaultUserApiId(null);
  persistScripts();
  notifyScriptsChanged();
}

export function setUserApiScriptEnabled(id: string, enabled: boolean): void {
  const script = scripts.get(id);
  if (!script) return;
  if (enabled && !isUserApiInitReady(script)) return;
  scripts.set(id, { ...script, enabled });
  persistScripts();
  notifyScriptsChanged();
  if (!enabled && getDefaultUserApiId() === id) {
    const ranked = listUserApiScripts()
      .filter((s) => s.enabled && isUserApiInitReady(s))
      .sort((a, b) => scoreUserApiScript(b) - scoreUserApiScript(a));
    setDefaultUserApiId(ranked[0]?.id ?? null);
  } else if (enabled && !getDefaultUserApiId()) {
    setDefaultUserApiId(id);
  } else if (enabled && scoreUserApiScript(script) >= 50) {
    // 启用高质量直连源时自动切为默认（覆盖坏掉的聚合代理）
    const current = getDefaultUserApiId();
    const curScript = current ? scripts.get(current) : null;
    if (!curScript || scoreUserApiScript(curScript) < scoreUserApiScript(script)) {
      setDefaultUserApiId(id);
    }
  }
}

export function setUserApiDefaultScript(id: string | null): void {
  if (!id) {
    setDefaultUserApiId(null);
    notifyScriptsChanged();
    return;
  }
  const script = scripts.get(id);
  if (!script || !isUserApiInitReady(script)) return;
  setDefaultUserApiId(id);
  notifyScriptsChanged();
}

export function normalizeUserApiTracks(
  scriptId: string,
  tracks: AudioTrack[],
): AudioTrack[] {
  return tracks.map((t) => ({
    ...t,
    source: 'userApi' as const,
    meta: { ...t.meta, userApiId: scriptId },
  }));
}

export function listUserApiScripts(): UserApiScript[] {
  return [...scripts.values()];
}

/** 取链顺序：默认源优先，其余按评分（直连 > 聚合） */
export function listEnabledUserApiScriptIdsForUrl(): string[] {
  const enabled = listUserApiScripts().filter(
    (s) => s.enabled && isUserApiInitReady(s),
  );
  if (!enabled.length) return [];
  const defaultId = getDefaultUserApiId();
  const ranked = [...enabled].sort((a, b) => {
    if (a.id === defaultId) return -1;
    if (b.id === defaultId) return 1;
    return scoreUserApiScript(b) - scoreUserApiScript(a);
  });
  return ranked.map((s) => s.id);
}

/** LX UserApi 脚本仅用于 URL/歌词解析，不支持搜索 */
export function listUserApiSearchScripts(): UserApiScript[] {
  return listUserApiScripts().filter(
    (s) => s.enabled && s.initStatus === 'ready' && isHandlerUserApiScript(s.script),
  );
}

async function getLxRuntime(script: UserApiScript) {
  let runtime = lxRuntimeCache.get(script.id);
  if (!runtime) {
    try {
      runtime = await loadLxUserApiScript(script);
      lxRuntimeCache.set(script.id, runtime);
    } catch (err) {
      lxRuntimeCache.delete(script.id);
      throw err;
    }
  }
  return runtime;
}

function resolveLxPlatformSource(track: AudioTrack): string {
  const metaSource = track.meta.platformSource ?? track.meta.source;
  if (typeof metaSource === 'string' && metaSource) return metaSource;
  if (track.source !== 'userApi' && track.source !== 'local') return track.source;
  return 'wy';
}

/** 对齐 lx-music toOldMusicInfo，供 UserApi 脚本读取 songmid/hash 等字段 */
export function trackToLxSongInfo(track: AudioTrack): Record<string, unknown> {
  const source = resolveLxPlatformSource(track);
  const rawId = track.id.includes('__') ? track.id.split('__').slice(1).join('__') : track.id;
  const songmid = String(track.meta.songmid ?? track.meta.songId ?? rawId);

  const qualitys = Array.isArray(track.meta.qualitys) ? track.meta.qualitys : [];
  let _types =
    (track.meta._qualitys as Record<string, unknown> | undefined) ??
    (track.meta._types as Record<string, unknown> | undefined) ??
    {};

  // kg：若未带 _qualitys，用 hash_* 字段补齐，供 UserApi 按音质取 hash
  if (source === 'kg' && Object.keys(_types).length === 0) {
    const built: Record<string, { hash: string }> = {};
    if (track.meta.hash) built['128k'] = { hash: String(track.meta.hash) };
    if (track.meta.hash_320) built['320k'] = { hash: String(track.meta.hash_320) };
    if (track.meta.hash_flac) built.flac = { hash: String(track.meta.hash_flac) };
    if (track.meta.hash_high) built.flac24bit = { hash: String(track.meta.hash_high) };
    _types = built;
  }

  const info: Record<string, unknown> = {
    name: track.name,
    singer: track.artist,
    source,
    songmid,
    interval: track.duration || '00:00',
    albumName: String(track.meta.albumName ?? track.meta.album ?? ''),
    albumId: String(track.meta.albumId ?? ''),
    img: String(track.meta.coverUrl ?? track.meta.picUrl ?? ''),
    typeUrl: {},
    types: qualitys.length
      ? qualitys
      : Object.keys(_types).map((type) => ({ type, size: '' })),
    _types,
  };

  if (source === 'kg') {
    info.hash = String(track.meta.hash ?? '');
  }
  if (source === 'mg') {
    info.copyrightId = String(track.meta.copyrightId ?? track.meta.songId ?? songmid);
  }
  if (source === 'tx') {
    info.strMediaMid = String(
      track.meta.strMediaMid ?? track.meta.mediaMid ?? songmid,
    );
    info.songId = track.meta.songId ?? track.meta.id;
    info.albumMid = String(track.meta.albumMid ?? '');
  }

  return info;
}

function normalizeUserApiMusicUrl(result: unknown): string | null {
  if (typeof result !== 'string') return null;
  if (result.length > 2048 || !/^https?:/.test(result)) return null;
  return result;
}

async function invokeLxUserApi(
  script: UserApiScript,
  payload: LxRequestPayload,
): Promise<unknown> {
  const runtime = await getLxRuntime(script);
  return runtime.invokeRequest(payload);
}

async function invokeUserApiQuickJS(
  script: UserApiScript,
  action: UserApiAction,
  args: Record<string, unknown>,
): Promise<unknown> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return invokeUserApiFunction(script, action, args);

  const payload = JSON.stringify({ action, args });
  const code = `
${script.script}
var __payload = ${payload};
if (typeof handler === 'function') {
  globalThis.result = handler(__payload.action, __payload.args);
} else if (typeof module !== 'undefined' && module.exports) {
  var __exp = module.exports.default || module.exports;
  if (typeof __exp === 'function') globalThis.result = __exp(__payload.action, __payload.args);
  else if (__exp && typeof __exp[__payload.action] === 'function') globalThis.result = __exp[__payload.action](__payload.args);
}
`;
  const result = await runLegadoScriptQuickJS({
    script: code,
    baseUrl: 'https://music.local/',
    timeoutMs: 30_000,
    mode: 'two-pass',
    inject: (vm) => {
      injectLegadoEncodingUtils(vm);
      injectBrowserLegadoShims(vm, 'https://music.local/');
    },
  });
  return result;
}

async function invokeUserApiFunction(
  script: UserApiScript,
  action: UserApiAction,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (isLxUserApiScript(script.script)) {
    throw new Error('LX UserApi 脚本不可通过 Function 运行时执行');
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...params: string[]
  ) => (action: UserApiAction, args: Record<string, unknown>) => Promise<unknown>;
  const fn = new AsyncFunction(
    'action',
    'args',
    `${script.script}\n` +
      'if (typeof handler === "function") return handler(action, args);\n' +
      'if (typeof module !== "undefined" && module.exports) {\n' +
      '  const exp = module.exports.default || module.exports;\n' +
      '  if (typeof exp === "function") return exp(action, args);\n' +
      '  if (exp && typeof exp[action] === "function") return exp[action](args);\n' +
      '}\n' +
      'return null;',
  );
  return fn(action, args);
}

export async function invokeUserApi(
  scriptId: string,
  action: UserApiAction,
  args: Record<string, unknown>,
): Promise<unknown> {
  const script = scripts.get(scriptId);
  if (!script?.enabled) throw new Error(`UserApi ${scriptId} 未启用`);
  if (!isUserApiInitReady(script)) throw new Error(`UserApi ${scriptId} 未通过初始化`);

  if (isLxUserApiScript(script.script)) {
    const track = (args.track ?? args.musicInfo ?? args.songInfo) as AudioTrack | undefined;
    const source = typeof args.source === 'string' ? args.source : resolveLxPlatformSource(track ?? { source: 'wy', meta: {} } as AudioTrack);
    const musicInfo =
      args.musicInfo ??
      args.songInfo ??
      (track ? trackToLxSongInfo(track) : undefined);
    const info = {
      ...(args.info as Record<string, unknown> | undefined),
      type: args.type ?? '128k',
      musicInfo,
    };
    return invokeLxUserApi(script, { source, action, info });
  }

  try {
    return await invokeUserApiQuickJS(script, action, args);
  } catch (e) {
    console.warn('[user-api] QuickJS 失败，降级 Function', e);
    return invokeUserApiFunction(script, action, args);
  }
}

export async function userApiSearch(
  scriptId: string,
  keyword: string,
): Promise<AudioTrack[]> {
  const script = scripts.get(scriptId);
  if (!script) return [];
  if (isLxUserApiScript(script.script)) {
    console.warn('[user-api] LX UserApi 脚本不支持搜索，请使用内置源（wy/kw/kg 等）');
    return [];
  }
  const result = await invokeUserApi(scriptId, 'search', { keyword });
  const raw = Array.isArray(result) ? (result as AudioTrack[]) : [];
  return normalizeUserApiTracks(scriptId, raw);
}

export async function userApiMusicUrl(
  scriptId: string,
  track: AudioTrack,
  platformSource?: string,
  quality?: import('@/lib/media/audio/lyric-types').MusicQuality,
): Promise<string | null> {
  const script = scripts.get(scriptId);
  if (!script?.enabled) throw new Error(`UserApi ${scriptId} 未启用`);
  const source = platformSource ?? resolveLxPlatformSource(track);
  const preferred =
    quality ?? (await import('@/lib/media/audio/music-quality')).getPlayQuality();
  const { qualityFallbackChain } = await import('@/lib/media/audio/music-quality');

  // 对齐 lx-music：只请求脚本登记的音质（无 wy_token 时小熊猫 wy 仅 128k）
  let supported: string[] = [];
  if (isLxUserApiScript(script.script)) {
    try {
      const runtime = await getLxRuntime(script);
      supported = runtime.sourceInfo.sources[source]?.qualitys ?? [];
    } catch {
      supported = [];
    }
  }
  const chain = qualityFallbackChain(preferred).filter(
    (q) => !supported.length || supported.includes(q),
  );
  const toTry = chain.length
    ? chain
    : supported.length
      ? (supported as typeof chain)
      : [preferred];

  let lastErr: unknown;
  for (const type of toTry) {
    try {
      const result = await invokeUserApi(scriptId, 'musicUrl', {
        track,
        musicInfo: trackToLxSongInfo(track),
        source,
        type,
      });
      const url = normalizeUserApiMusicUrl(result);
      if (url) return url;
    } catch (err) {
      lastErr = err;
      console.warn('[user-api] musicUrl try failed', scriptId, source, type, err);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

export async function userApiPic(
  scriptId: string,
  track: AudioTrack,
): Promise<string | null> {
  const source = resolveLxPlatformSource(track);
  const musicInfo = trackToLxSongInfo(track);
  const result = await invokeUserApi(scriptId, 'pic', {
    track,
    musicInfo,
    source,
  });
  return typeof result === 'string' ? result : null;
}

export async function userApiSongList(
  scriptId: string,
  action: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return invokeUserApi(scriptId, 'songList', { action, ...data });
}

export async function userApiLeaderboard(
  scriptId: string,
  action: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return invokeUserApi(scriptId, 'leaderboard', { action, ...data });
}

export async function userApiLyric(
  scriptId: string,
  track: AudioTrack,
): Promise<string | null> {
  const source = resolveLxPlatformSource(track);
  const musicInfo = trackToLxSongInfo(track);
  const result = await invokeUserApi(scriptId, 'lyric', {
    track,
    musicInfo,
    source,
  });
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'lyric' in result) {
    const lyric = (result as { lyric?: unknown }).lyric;
    return typeof lyric === 'string' ? lyric : null;
  }
  return null;
}
