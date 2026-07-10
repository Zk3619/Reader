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
  isLxUserApiScript,
  loadLxUserApiScript,
  type LxRequestPayload,
} from '@/lib/media/audio/online/lx-user-api-shim';

export { getDefaultUserApiId, setDefaultUserApiId };

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
  /** 脚本源码 */
  script: string;
  enabled: boolean;
}

const scripts = new Map<string, UserApiScript>();
const lxRuntimeCache = new Map<
  string,
  Awaited<ReturnType<typeof loadLxUserApiScript>>
>();
const STORAGE_KEY = 'reader_audio_user_api_scripts';

function loadScriptsFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as UserApiScript[];
    for (const s of list) scripts.set(s.id, s);
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
  if (isLxUserApiScript(script)) return false;
  return /\bhandler\s*[=(]/.test(script) || /module\.exports/.test(script);
}

export function registerUserApiScript(script: UserApiScript): void {
  scripts.set(script.id, script);
  lxRuntimeCache.delete(script.id);
  persistScripts();
}

export function removeUserApiScript(id: string): void {
  scripts.delete(id);
  lxRuntimeCache.delete(id);
  if (getDefaultUserApiId() === id) setDefaultUserApiId(null);
  persistScripts();
}

export function setUserApiScriptEnabled(id: string, enabled: boolean): void {
  const script = scripts.get(id);
  if (!script) return;
  scripts.set(id, { ...script, enabled });
  persistScripts();
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

/** LX UserApi 脚本仅用于 URL/歌词解析，不支持搜索 */
export function listUserApiSearchScripts(): UserApiScript[] {
  return listUserApiScripts().filter((s) => s.enabled && isHandlerUserApiScript(s.script));
}

async function getLxRuntime(script: UserApiScript) {
  let runtime = lxRuntimeCache.get(script.id);
  if (!runtime) {
    runtime = await loadLxUserApiScript(script);
    lxRuntimeCache.set(script.id, runtime);
  }
  return runtime;
}

function resolveLxPlatformSource(track: AudioTrack): string {
  const metaSource = track.meta.platformSource ?? track.meta.source;
  if (typeof metaSource === 'string' && metaSource) return metaSource;
  if (track.source !== 'userApi' && track.source !== 'local') return track.source;
  return 'wy';
}

function trackToLxSongInfo(track: AudioTrack): Record<string, unknown> {
  return {
    name: track.name,
    singer: track.artist,
    albumName: track.meta.albumName ?? track.meta.album ?? '',
    interval: track.duration,
    songmid: track.meta.songmid ?? track.meta.songId ?? track.id,
    hash: track.meta.hash ?? '',
    albumId: track.meta.albumId ?? '',
    ...track.meta,
  };
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

  if (isLxUserApiScript(script.script)) {
    const track = (args.track ?? args.songInfo) as AudioTrack | undefined;
    const source = typeof args.source === 'string' ? args.source : resolveLxPlatformSource(track ?? { source: 'wy', meta: {} } as AudioTrack);
    const info = {
      ...(args.info as Record<string, unknown> | undefined),
      type: args.type ?? '128k',
      songInfo: args.songInfo ?? (track ? trackToLxSongInfo(track) : undefined),
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
  const source = platformSource ?? resolveLxPlatformSource(track);
  const type = quality ?? (await import('@/lib/media/audio/music-quality')).getPlayQuality();
  const result = await invokeUserApi(scriptId, 'musicUrl', {
    track,
    songInfo: trackToLxSongInfo(track),
    source,
    type,
  });
  return typeof result === 'string' ? result : null;
}

export async function userApiPic(
  scriptId: string,
  track: AudioTrack,
): Promise<string | null> {
  const source = resolveLxPlatformSource(track);
  const result = await invokeUserApi(scriptId, 'pic', {
    track,
    songInfo: trackToLxSongInfo(track),
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
  const result = await invokeUserApi(scriptId, 'lyric', {
    track,
    songInfo: trackToLxSongInfo(track),
    source,
  });
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'lyric' in result) {
    const lyric = (result as { lyric?: unknown }).lyric;
    return typeof lyric === 'string' ? lyric : null;
  }
  return null;
}
