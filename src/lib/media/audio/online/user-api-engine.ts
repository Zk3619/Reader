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
import {
  getUserApiInitMode,
  isUserApiUpdateGloballyMuted,
  type UserApiInitMode,
} from '@/lib/media/audio/online/user-api-update-prefs';

export { getDefaultUserApiId, setDefaultUserApiId };

/** 挑选下一个默认活跃源：启用且就绪，按导入顺序；不按脚本内容打分（用户源不可控） */
function pickFallbackDefaultUserApiId(excludeId?: string | null): string | null {
  for (const s of scripts.values()) {
    if (excludeId && s.id === excludeId) continue;
    if (s.enabled && isUserApiInitReady(s)) return s.id;
  }
  return null;
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
  /** 对齐 lx：是否允许弹出音源更新提示（默认 true） */
  allowShowUpdateAlert?: boolean;
  /** 初始化状态：添加音源或设置页校验时更新 */
  initStatus?: 'pending' | 'ready' | 'failed';
  initError?: string;
}

const scripts = new Map<string, UserApiScript>();
/** 进行中的 init：并发取链时复用同一 Promise，避免 pending 被直接跳过 */
const initInFlight = new Map<string, Promise<{ ok: true } | { ok: false; error: string }>>();
const lxRuntimeCache = new Map<
  string,
  Awaited<ReturnType<typeof loadLxUserApiScript>>
>();
const STORAGE_KEY = 'reader_audio_user_api_scripts';
const scriptListeners = new Set<() => void>();

/** 对齐 lx：初始化失败弹窗 */
export type UserApiInitFailedAlert = {
  name: string;
  message: string;
};

type InitFailedListener = (alert: UserApiInitFailedAlert) => void;
const initFailedListeners = new Set<InitFailedListener>();

export function subscribeUserApiInitFailed(listener: InitFailedListener): () => void {
  initFailedListeners.add(listener);
  return () => initFailedListeners.delete(listener);
}

function notifyUserApiInitFailed(alert: UserApiInitFailedAlert): void {
  for (const fn of initFailedListeners) fn(alert);
}

/** 将底层网络/运行时错误转成用户可读文案；保留音源脚本自行抛出的业务提示 */
export function toUserFacingInitError(raw: unknown): string {
  const msg = (raw instanceof Error ? raw.message : String(raw ?? '')).trim();
  if (!msg) return '音源初始化失败';

  const looksTechnical =
    /HttpError|发送请求失败|error sending request|unexpected EOF|Network Error|Failed to fetch|ECONNREFUSED|ENOTFOUND|TLS|handshake|certificate|超时|timeout|statusCode|Cannot read propert|TypeError|UserApi 初始化超时|at async|https?:\/\//i.test(
      msg,
    );

  // 音源业务文案（如「当前版本音源已关闭」）保留
  if (/[\u4e00-\u9fff]/.test(msg) && !looksTechnical && msg.length <= 300) {
    return msg;
  }

  if (/发送请求失败|error sending request|unexpected EOF|Network Error|Failed to fetch|ECONNREFUSED|ENOTFOUND|TLS|handshake|certificate/i.test(msg)) {
    return '音源接口无法访问，请检查网络或稍后再试';
  }
  if (/UserApi 初始化超时|timeout|超时/i.test(msg)) {
    return '音源初始化超时，请稍后再试';
  }
  if (/statusCode|Cannot read propert|TypeError/i.test(msg)) {
    return '音源脚本运行异常';
  }
  if (looksTechnical) {
    return '音源初始化失败，请更换音源或稍后再试';
  }
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}

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
    let droppedFailed = false;
    for (const s of list) {
      const initStatus = s.initStatus ?? 'pending';
      // 失败源不进列表（对齐 lx：异常源只弹窗，不留在自定义源列表）
      if (initStatus === 'failed') {
        droppedFailed = true;
        continue;
      }
      scripts.set(
        s.id,
        applyScriptHeaderMeta({
          ...s,
          initStatus,
          initError: s.initError,
          enabled: initStatus === 'ready' ? s.enabled : false,
          allowShowUpdateAlert: s.allowShowUpdateAlert !== false,
        }),
      );
    }
    if (droppedFailed) persistScripts();
    // 仅清除无效默认；无默认时取第一个启用且就绪的导入源
    const defaultId = getDefaultUserApiId();
    if (defaultId) {
      const current = scripts.get(defaultId);
      if (!current || !isUserApiInitReady(current)) {
        setDefaultUserApiId(null);
      }
    }
    if (!getDefaultUserApiId()) {
      const next = pickFallbackDefaultUserApiId();
      if (next) setDefaultUserApiId(next);
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
  const existing = initInFlight.get(id);
  if (existing) return existing;

  const script = scripts.get(id);
  if (!script) return { ok: false, error: '脚本不存在' };
  if (script.initStatus === 'ready' && (!isLxUserApiScript(script.script) || lxRuntimeCache.has(id))) {
    return { ok: true };
  }

  const task = (async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    patchUserApiScript(id, { initStatus: 'pending', initError: undefined });
    try {
      const cur = scripts.get(id);
      if (!cur) return { ok: false, error: '脚本不存在' };
      if (isLxUserApiScript(cur.script)) {
        lxRuntimeCache.delete(id);
        const runtime = await loadLxUserApiScript({
          id: cur.id,
          name: cur.name,
          script: cur.script,
          allowShowUpdateAlert: cur.allowShowUpdateAlert !== false,
        });
        lxRuntimeCache.set(id, runtime);
      } else {
        await initQuickJSRuntime();
      }
      patchUserApiScript(id, { initStatus: 'ready', initError: undefined });
      return { ok: true };
    } catch (err) {
      const error = toUserFacingInitError(err);
      lxRuntimeCache.delete(id);
      patchUserApiScript(id, {
        initStatus: 'failed',
        initError: error,
        enabled: false,
      });
      if (getDefaultUserApiId() === id) setDefaultUserApiId(null);
      return { ok: false, error };
    } finally {
      initInFlight.delete(id);
    }
  })();

  initInFlight.set(id, task);
  return task;
}

function normalizeScriptContent(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/** 按脚本文本查找已有源（对齐 LX 导入去重） */
export function findUserApiScriptByContent(script: string): UserApiScript | null {
  const normalized = normalizeScriptContent(script);
  if (!normalized) return null;
  for (const s of scripts.values()) {
    if (s.initStatus === 'failed') continue;
    if (normalizeScriptContent(s.script) === normalized) return s;
  }
  return null;
}

/** 按名称查找已有源（用于同名更新） */
export function findUserApiScriptByName(name: string): UserApiScript | null {
  const key = name.trim();
  if (!key) return null;
  for (const s of scripts.values()) {
    if (s.initStatus === 'failed') continue;
    if (s.name.trim() === key) return s;
  }
  return null;
}

export type ImportUserApiScriptResult = {
  id: string;
  name: string;
  ok: boolean;
  /** 与已有源脚本文本完全相同，未写入 */
  skipped?: boolean;
  /** 覆盖了已有源 */
  updated?: boolean;
  error?: string;
};

/**
 * 导入并初始化音源：成功前不进列表；失败弹窗（用户可读文案）。
 * - 脚本文本与已有源相同 → skipped（对齐 LX）
 * - 传入 replaceId → 原地替换并 reinject，保留启用状态与更新提示偏好
 */
export async function importUserApiScript(input: {
  script: string;
  fileName?: string;
  fallbackName?: string;
  /** 指定覆盖的已有源 id（同名更新 / 更新地址升级） */
  replaceId?: string;
}): Promise<ImportUserApiScriptResult> {
  const headerMeta = parseLxScriptHeaderMeta(input.script);
  const name =
    headerMeta.name ??
    (input.fallbackName?.trim() ||
      input.fileName?.replace(/\.[^.]+$/, '') ||
      '未命名音源');

  const duplicate = findUserApiScriptByContent(input.script);
  if (duplicate) {
    return {
      id: duplicate.id,
      name: duplicate.name,
      ok: true,
      skipped: true,
      error: `脚本内容与已有的源「${duplicate.name}」相同`,
    };
  }

  const replaceId = input.replaceId?.trim() || '';
  const existing = replaceId ? scripts.get(replaceId) : undefined;
  if (replaceId && !existing) {
    return { id: replaceId, name, ok: false, error: '要更新的源不存在' };
  }

  const id = existing?.id ?? `userapi_${Date.now()}`;
  const allowShowUpdateAlert = existing?.allowShowUpdateAlert !== false;
  const wasEnabled = existing?.enabled ?? false;
  const keepAsDefault = existing ? getDefaultUserApiId() === existing.id : false;

  try {
    if (isLxUserApiScript(input.script)) {
      lxRuntimeCache.delete(id);
      const runtime = await loadLxUserApiScript({
        id,
        name,
        script: input.script,
        allowShowUpdateAlert,
      });
      const normalized = applyScriptHeaderMeta({
        id,
        name,
        script: input.script,
        enabled: wasEnabled,
        allowShowUpdateAlert,
        initStatus: 'ready',
      });
      scripts.set(normalized.id, normalized);
      lxRuntimeCache.set(id, runtime);
    } else {
      await initQuickJSRuntime();
      lxRuntimeCache.delete(id);
      const normalized = applyScriptHeaderMeta({
        id,
        name,
        script: input.script,
        enabled: wasEnabled,
        allowShowUpdateAlert,
        initStatus: 'ready',
      });
      scripts.set(normalized.id, normalized);
    }

    persistScripts();
    notifyScriptsChanged();

    if (existing) {
      if (keepAsDefault) setDefaultUserApiId(id);
      return { id, name, ok: true, updated: true };
    }

    const hasEnabled = listUserApiScripts().some((s) => s.id !== id && s.enabled);
    if (!hasEnabled) {
      setUserApiScriptEnabled(id, true);
      if (!getDefaultUserApiId()) setDefaultUserApiId(id);
    }

    return { id, name, ok: true };
  } catch (err) {
    lxRuntimeCache.delete(id);
    if (!existing) scripts.delete(id);
    else {
      scripts.set(existing.id, { ...existing });
      persistScripts();
      notifyScriptsChanged();
    }
    const message = toUserFacingInitError(err);
    notifyUserApiInitFailed({ name, message });
    return { id, name, ok: false, error: message };
  }
}

/** 本会话是否已为 updateAlert 强制重载过 runtime */
let sessionUpdateAlertWarmed = false;

/** 按初始化策略挑选待预热音源（永不包含未启用） */
export function shouldInitializeUserApiScriptForMode(
  mode: UserApiInitMode,
  scriptId: string,
  activeId: string | null,
): boolean {
  return mode === 'allEnabled' || scriptId === activeId;
}

export function listUserApiScriptsForWarmup(mode?: UserApiInitMode): UserApiScript[] {
  const initMode = mode ?? getUserApiInitMode();
  const enabled = listUserApiScripts().filter((s) => s.enabled);
  if (initMode === 'allEnabled') return enabled;
  const activeId = getDefaultUserApiId();
  const active = enabled.find((s) =>
    shouldInitializeUserApiScriptForMode(initMode, s.id, activeId),
  );
  if (active) return [active];
  return enabled[0] ? [enabled[0]] : [];
}

/**
 * 按策略初始化 / 预热音源（触发 updateAlert）。
 * - activeOnly：仅默认活跃（启用）源
 * - allEnabled：全部已启用源
 * - 未启用源不预热；启用时再 init
 * - forceUpdateCheck：切换策略后强制对各目标重载 runtime 以检查更新
 */
export async function ensureUserApiScriptsInitialized(options?: {
  mode?: UserApiInitMode;
  forceUpdateCheck?: boolean;
}): Promise<void> {
  if (options?.forceUpdateCheck) {
    sessionUpdateAlertWarmed = false;
  }

  const targets = listUserApiScriptsForWarmup(options?.mode);
  for (const script of targets) {
    if (script.initStatus === 'failed') {
      continue;
    }
    if (script.initStatus !== 'ready') {
      const result = await initUserApiScript(script.id);
      if (!result.ok) {
        const name = scripts.get(script.id)?.name ?? script.name;
        const message = toUserFacingInitError(result.error ?? '初始化失败');
        // 启动预热失败：移出列表并弹窗（不把异常源留在列表）
        removeUserApiScript(script.id);
        notifyUserApiInitFailed({ name, message });
      }
      continue;
    }
    if (!isLxUserApiScript(script.script)) continue;
    // 全局静音期内不强制重载检查更新；首次取链仍会按需创建 runtime
    if (!sessionUpdateAlertWarmed && !isUserApiUpdateGloballyMuted()) {
      lxRuntimeCache.delete(script.id);
    }
    try {
      await getLxRuntime(script);
    } catch (err) {
      console.warn('[user-api] warm runtime failed', script.name, err);
    }
  }
  sessionUpdateAlertWarmed = true;
}

export function removeUserApiScript(id: string): void {
  scripts.delete(id);
  lxRuntimeCache.delete(id);
  if (getDefaultUserApiId() === id) {
    setDefaultUserApiId(pickFallbackDefaultUserApiId(id));
  }
  persistScripts();
  notifyScriptsChanged();
}

export function setUserApiScriptEnabled(id: string, enabled: boolean): void {
  const script = scripts.get(id);
  if (!script) return;
  if (enabled) {
    // 启用时才初始化：未就绪则异步 init，失败则回滚启用
    scripts.set(id, { ...script, enabled: true });
    if (!getDefaultUserApiId()) setDefaultUserApiId(id);
    persistScripts();
    notifyScriptsChanged();
    const shouldInitialize = shouldInitializeUserApiScriptForMode(
      getUserApiInitMode(),
      id,
      getDefaultUserApiId(),
    );
    if (
      shouldInitialize &&
      !isUserApiInitReady(script) &&
      (script.initStatus !== 'pending' || !initInFlight.has(id))
    ) {
      void initUserApiScript(id).then((result) => {
        if (result.ok) return;
        const cur = scripts.get(id);
        const name = cur?.name ?? id;
        const message = toUserFacingInitError(result.error ?? '初始化失败');
        // 启用时初始化失败：移除并弹窗，避免失败源留在列表
        removeUserApiScript(id);
        notifyUserApiInitFailed({ name, message });
      });
    } else if (isUserApiInitReady(script) && isLxUserApiScript(script.script) && !lxRuntimeCache.has(id)) {
      void getLxRuntime(scripts.get(id)!).catch((err) => {
        console.warn('[user-api] enable warm failed', script.name, err);
      });
    }
    return;
  }

  scripts.set(id, { ...script, enabled: false });
  if (getDefaultUserApiId() === id) {
    setDefaultUserApiId(pickFallbackDefaultUserApiId(id));
  }
  persistScripts();
  notifyScriptsChanged();
}

/** 对齐 lx setAllowShowUserApiUpdateAlert */
export function setUserApiAllowShowUpdateAlert(id: string, allow: boolean): void {
  const script = scripts.get(id);
  if (!script) return;
  scripts.set(id, { ...script, allowShowUpdateAlert: allow });
  persistScripts();
  notifyScriptsChanged();
}

export function setUserApiDefaultScript(id: string | null): void {
  if (!id) {
    setDefaultUserApiId(null);
    notifyScriptsChanged();
    return;
  }
  const script = scripts.get(id);
  if (!script) return;
  setDefaultUserApiId(id);
  // 设为活跃时自动启用（对齐 lx 单一 apiSource）
  if (!script.enabled) {
    scripts.set(id, { ...script, enabled: true });
    persistScripts();
  }
  notifyScriptsChanged();
  if (!isUserApiInitReady(script) && !initInFlight.has(id)) {
    void initUserApiScript(id).then((result) => {
      if (result.ok) return;
      const current = scripts.get(id);
      const name = current?.name ?? id;
      const message = toUserFacingInitError(result.error ?? '初始化失败');
      removeUserApiScript(id);
      notifyUserApiInitFailed({ name, message });
    });
  }
}

/** 活跃源是否在熔断保护白名单（用户默认源永不因熔断被跳过） */
export function isActiveUserApiId(scriptId: string | null | undefined): boolean {
  if (!scriptId) return false;
  return getDefaultUserApiId() === scriptId;
}

/** 当前活跃 UserApi 展示名（状态栏用） */
export function getActiveUserApiDisplayName(): string | null {
  const id = getDefaultUserApiId();
  if (!id) return null;
  return scripts.get(id)?.name ?? id;
}

/** 脚本登记的全平台音质并集（驱动 UI gating） */
export function getActiveUserApiQualitys(): string[] {
  const id = getDefaultUserApiId();
  if (!id) return [];
  const runtime = lxRuntimeCache.get(id);
  if (!runtime?.sourceInfo?.sources) return [];
  const set = new Set<string>();
  for (const src of Object.values(runtime.sourceInfo.sources)) {
    for (const q of src.qualitys ?? []) set.add(q);
  }
  return [...set];
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

export function selectReadyUserApiScriptIdsForPlayback(
  candidates: Array<Pick<UserApiScript, 'id' | 'enabled' | 'initStatus'>>,
  activeId: string | null,
  includeFallback: boolean,
): string[] {
  const enabled = candidates.filter(
    (s) => s.enabled && s.initStatus === 'ready',
  );
  if (!enabled.length) return [];
  const ranked = [...enabled].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return 0;
  });
  return ranked
    .filter((script) => includeFallback || script.id === activeId)
    .map((script) => script.id);
}

/** 取链顺序：当前活跃源 → 其他已启用且初始化成功的源。 */
export function listEnabledUserApiScriptIdsForUrl(): string[] {
  return selectReadyUserApiScriptIdsForPlayback(
    listUserApiScripts(),
    getDefaultUserApiId(),
    true,
  );
}

export function listUserApiScriptIdsForPlayback(includeFallback: boolean): string[] {
  return selectReadyUserApiScriptIdsForPlayback(
    listUserApiScripts(),
    getDefaultUserApiId(),
    includeFallback,
  );
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
      runtime = await loadLxUserApiScript({
        id: script.id,
        name: script.name,
        script: script.script,
        allowShowUpdateAlert: script.allowShowUpdateAlert !== false,
      });
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
    quality ?? (await import('@/lib/media/audio/music-quality')).getPlayQuality(track);
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
      let result: unknown = await invokeUserApi(scriptId, 'musicUrl', {
        track,
        musicInfo: trackToLxSongInfo(track),
        source,
        type,
      });
      // 防御：个别脚本返回未完全展开的 thenable
      for (
        let i = 0;
        i < 3 &&
        result != null &&
        typeof result === 'object' &&
        typeof (result as { then?: unknown }).then === 'function';
        i++
      ) {
        result = await (result as PromiseLike<unknown>);
      }
      const url = normalizeUserApiMusicUrl(result);
      if (url) return url;
    } catch (err) {
      lastErr = err;
      console.warn('[user-api] musicUrl try failed', scriptId, source, type, err);
      const msg = err instanceof Error ? err.message : String(err ?? '');
      // IP 封禁 / 限流：再试其它音质只会继续被封，立刻中止本脚本音质链
      if (/block\s*ip|too many requests|封禁|频繁|rate.?limit/i.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
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
