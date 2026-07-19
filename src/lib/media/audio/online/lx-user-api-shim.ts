/**
 * LX Music UserApi 脚本运行时（对齐 lx-music-desktop preload.js）
 */

import CryptoJS from 'crypto-js';
import { inflate as fflateInflate, deflate as fflateDeflate } from 'fflate';
import forge from 'node-forge';
import { request } from '@/lib/http';

export const LX_EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
} as const;

export type UserApiUpdateAlert = {
  scriptId?: string;
  scriptName: string;
  log: string;
  updateUrl: string;
};

export type UserApiUpdateCheckFailed = {
  scriptId?: string;
  scriptName: string;
  updateUrl: string;
  error: string;
};

type UpdateAlertBatchListener = (alerts: UserApiUpdateAlert[]) => void;
type UpdateCheckFailedListener = (info: UserApiUpdateCheckFailed) => void;

const updateAlertListeners = new Set<UpdateAlertBatchListener>();
const updateCheckFailedListeners = new Set<UpdateCheckFailedListener>();
let pendingUpdateAlerts = new Map<string, UserApiUpdateAlert>();
let lastUpdateAlertBatch: UserApiUpdateAlert[] = [];
let updateAlertFlushTimer: ReturnType<typeof setTimeout> | null = null;
/** 同脚本短时间内只提示一次检查更新失败 */
const updateCheckFailedToastAt = new Map<string, number>();
const UPDATE_CHECK_FAIL_TOAST_COOLDOWN_MS = 60_000;

export function subscribeUserApiUpdateAlert(
  listener: UpdateAlertBatchListener,
): () => void {
  updateAlertListeners.add(listener);
  if (lastUpdateAlertBatch.length) listener(lastUpdateAlertBatch);
  return () => updateAlertListeners.delete(listener);
}

export function subscribeUserApiUpdateCheckFailed(
  listener: UpdateCheckFailedListener,
): () => void {
  updateCheckFailedListeners.add(listener);
  return () => updateCheckFailedListeners.delete(listener);
}

function notifyUserApiUpdateCheckFailed(info: UserApiUpdateCheckFailed): void {
  const key = info.scriptId || info.scriptName || info.updateUrl;
  const now = Date.now();
  const last = updateCheckFailedToastAt.get(key) ?? 0;
  if (now - last < UPDATE_CHECK_FAIL_TOAST_COOLDOWN_MS) return;
  updateCheckFailedToastAt.set(key, now);
  for (const fn of updateCheckFailedListeners) {
    try {
      fn(info);
    } catch (err) {
      console.warn('[user-api] updateCheckFailed listener error', err);
    }
  }
}

function isLikelyUpdateCheckUrl(url: string, updateUrl?: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (updateUrl && u === updateUrl.trim()) return true;
  // 社区音源常见：@update_url 指向 .json 版本清单
  if (/\.json(?:\?|#|$)/i.test(u) && /lxmusic|update|version|changqing|svip/i.test(u)) {
    return true;
  }
  return false;
}

function isTlsOrSendFailureMessage(msg: string): boolean {
  return /handshake|unexpected\s*EOF|tls|certificate|ssl|error sending request|发送请求失败|Network Error/i.test(
    msg,
  );
}

/** @deprecated 请用 getLastUserApiUpdateAlertBatch */
export function getLastUserApiUpdateAlert(): UserApiUpdateAlert | null {
  return lastUpdateAlertBatch[0] ?? null;
}

export function getLastUserApiUpdateAlertBatch(): UserApiUpdateAlert[] {
  return [...lastUpdateAlertBatch];
}

export function clearUserApiUpdateAlert(): void {
  lastUpdateAlertBatch = [];
  pendingUpdateAlerts.clear();
  if (updateAlertFlushTimer) {
    clearTimeout(updateAlertFlushTimer);
    updateAlertFlushTimer = null;
  }
}

function flushPendingUpdateAlerts(): void {
  updateAlertFlushTimer = null;
  const batch = [...pendingUpdateAlerts.values()];
  pendingUpdateAlerts.clear();
  if (!batch.length) return;
  lastUpdateAlertBatch = batch;
  for (const fn of updateAlertListeners) fn(batch);
}

async function notifyUserApiUpdateAlert(alert: UserApiUpdateAlert): Promise<void> {
  try {
    const { shouldSuppressUserApiUpdateAlert } = await import(
      '@/lib/media/audio/online/user-api-update-prefs'
    );
    if (
      shouldSuppressUserApiUpdateAlert({
        scriptId: alert.scriptId,
        updateUrl: alert.updateUrl,
      })
    ) {
      console.info('[user-api] updateAlert suppressed by prefs', alert.scriptName);
      return;
    }
  } catch (err) {
    console.warn('[user-api] updateAlert prefs check failed, show anyway', err);
  }
  const key = alert.scriptId || alert.scriptName || alert.updateUrl || String(Date.now());
  pendingUpdateAlerts.set(key, alert);
  if (updateAlertFlushTimer) clearTimeout(updateAlertFlushTimer);
  // 多个音源顺序 init 时合并为一次列表弹窗
  updateAlertFlushTimer = setTimeout(flushPendingUpdateAlerts, 800);
}

export type LxUserApiSourceInfo = {
  sources: Record<
    string,
    { type: string; actions: string[]; qualitys: string[] }
  >;
};

export type LxRequestPayload = {
  source: string;
  action: string;
  info: Record<string, unknown>;
};

type LxHttpResponse = {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[]>;
  body: unknown;
  raw: string;
};

const LX_REQUEST_TIMEOUT_MS = 15_000;

const LX_FAILED_SCRIPT_BODY = {
  code: -1,
  data: [{ url: null, freeTrialInfo: null }],
};

/** 社区音源常在检查 err 前访问 resp.body，失败时不能传 null */
function createEmptyLxResponse(err?: Error | null): LxHttpResponse {
  return {
    statusCode: 0,
    statusMessage: err?.message ?? '',
    headers: {},
    body: { ...LX_FAILED_SCRIPT_BODY },
    raw: '',
  };
}

/**
 * 仅规范化「已解析的 JSON 对象」。
 * HTML/JS 等字符串 body 必须原样返回（酷我 getToken 会 `response.body.match(...)`）。
 * 官方小熊猫成功体为 `data: { url }`，绝不能改成 `data: [{ url: null }]`。
 * 野花/野草成功体为 `data: "http://..."` 字符串 URL，必须原样保留。
 */
function normalizeLxJsonResponseBody(parsed: Record<string, unknown>, statusCode: number): unknown {
  // npm package.json / 音源更新检查响应带 version，勿注入假音乐 data 字段
  if (
    statusCode < 400 &&
    typeof parsed.version === 'string' &&
    (parsed.data === undefined || parsed.data === null)
  ) {
    return parsed;
  }
  const failedData = LX_FAILED_SCRIPT_BODY.data;
  if (statusCode >= 400) {
    return { code: statusCode, data: failedData, ...parsed };
  }
  // 字符串 URL（代理源）/ 对象 {url}（直连源）一律保留
  if (typeof parsed.data === 'string' || (parsed.data && typeof parsed.data === 'object')) {
    return parsed;
  }
  if (parsed.data === undefined || parsed.data === null) {
    return { ...parsed, data: failedData };
  }
  if (Array.isArray(parsed.data) && parsed.data.length === 0) {
    return { ...parsed, data: failedData };
  }
  return parsed;
}

/** needle 下 set-cookie 常为 string[]；部分脚本用 .find / .match */
function normalizeLxResponseHeaders(
  headers: Record<string, string>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = { ...headers };
  const setCookie =
    headers['set-cookie'] ??
    headers['Set-Cookie'] ??
    headers['SET-COOKIE'];
  if (typeof setCookie === 'string' && setCookie.trim()) {
    // 可能被合并成一条；按常见分隔拆成数组供脚本 .find
    const parts = setCookie.split(/,(?=\s*[^;=]+=)/).map((s) => s.trim()).filter(Boolean);
    out['set-cookie'] = parts.length > 1 ? parts : [setCookie];
  }
  return out;
}

function settleLxRequestCallbackResult(
  result: unknown,
  onAsyncRejection?: (error: Error) => void,
): void {
  if (result == null || typeof (result as PromiseLike<unknown>).then !== 'function') {
    return;
  }
  // 脚本常写 async callback 并在失败时 throw/reject，未 await 会变成 Uncaught (in promise)
  void Promise.resolve(result).catch((asyncErr) => {
    console.warn('[user-api] request callback async rejection', asyncErr);
    onAsyncRejection?.(
      asyncErr instanceof Error ? asyncErr : new Error(String(asyncErr)),
    );
  });
}

/**
 * 失败时始终给空壳 resp（六音等会读 resp.statusCode，不能为 null）。
 * err 仍按 lx/needle 原样传入，脚本可先判 err。
 */
function invokeLxRequestCallback(
  callback: (
    err: Error | null,
    resp: LxHttpResponse | null,
    body: unknown,
  ) => void | Promise<void>,
  err: Error | null,
  resp: LxHttpResponse | null,
  body: unknown,
  onAsyncRejection?: (error: Error) => void,
): void {
  const safeResp = resp ?? createEmptyLxResponse(err);
  const safeBody = body ?? safeResp.body;
  try {
    settleLxRequestCallbackResult(callback(err, safeResp, safeBody), onAsyncRejection);
  } catch (syncErr) {
    console.warn('[user-api] request callback threw', syncErr);
    if (!err) {
      const retryErr =
        syncErr instanceof Error ? syncErr : new Error(String(syncErr));
      try {
        settleLxRequestCallbackResult(
          callback(retryErr, safeResp, safeBody),
          onAsyncRejection,
        );
      } catch {
        // 脚本未正确处理 err，依赖 invokeRequest 超时兜底
      }
    } else {
      onAsyncRejection?.(
        syncErr instanceof Error ? syncErr : new Error(String(syncErr)),
      );
    }
  }
}

/** 与 lx-music preload：`events.request.call(lx, { source, action, info })` */
type LxRequestHandler = (
  this: LxGlobal,
  data: LxRequestPayload,
) => Promise<unknown>;

export type LxGlobal = {
  EVENT_NAMES: typeof LX_EVENT_NAMES;
  request: (
    url: string,
    options: {
      method?: string;
      timeout?: number;
      headers?: Record<string, string>;
      body?: string;
      form?: Record<string, string>;
      formData?: Record<string, string>;
    },
    callback: (
      err: Error | null,
      resp: LxHttpResponse | null,
      body: unknown,
    ) => void,
  ) => () => void;
  send: (eventName: string, data?: unknown) => Promise<void>;
  on: (eventName: string, handler: LxRequestHandler) => Promise<void>;
  utils: {
    crypto: {
      aesEncrypt: (
        buffer: Uint8Array | string,
        mode: string,
        key: Uint8Array | string,
        iv: Uint8Array | string,
      ) => Uint8Array;
      rsaEncrypt: (buffer: Uint8Array, key: string) => Uint8Array;
      randomBytes: (size: number) => Uint8Array;
      md5: (str: string) => string;
    };
    buffer: {
      from: (...args: unknown[]) => Uint8Array;
      bufToString: (buf: Uint8Array, format: string) => string;
    };
    zlib: {
      inflate: (buf: Uint8Array) => Promise<Uint8Array>;
      deflate: (data: Uint8Array) => Promise<Uint8Array>;
    };
  };
  currentScriptInfo: Record<string, unknown>;
  version: string;
  env: string;
};

export function isLxUserApiScript(script: string): boolean {
  if (isHandlerOnlyUserApiScript(script)) return false;
  // 社区 LX UserApi 脚本格式多样，非 handler 脚本一律走 LX 运行时
  return true;
}

/** Legado handler / module.exports 风格脚本，不走 LX 运行时 */
export function isHandlerOnlyUserApiScript(script: string): boolean {
  if (/\blx_setup\b/.test(script)) return false;
  if (/globalThis[\.\[]\s*['"]?lx['"]?\s*\]?/.test(script)) return false;
  if (/\blx\.(on|send|request)\b/.test(script)) return false;
  if (/@name\s+\S/.test(script) && !/\bhandler\s*[=(]/.test(script)) return false;
  return /\bhandler\s*[=(]/.test(script) || /module\.exports/.test(script);
}

function promisifyInflate(buf: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    fflateInflate(buf, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function promisifyDeflate(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    fflateDeflate(data, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });
}

type LxGlobalHost = typeof globalThis & {
  lx?: LxGlobal;
  lx_setup?: (...args: unknown[]) => void;
};

export type LxScriptHeaderMeta = {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  homepage?: string;
  updateUrl?: string;
};

/** 解析 LX UserApi 脚本头部 @name / @version / @update_url 等注释 */
export function parseLxScriptHeaderMeta(script: string): LxScriptHeaderMeta {
  const meta: LxScriptHeaderMeta = {};
  const head = script.slice(0, 4096);
  for (const line of head.split('\n')) {
    const m = line.match(
      /^\s*\*\s*@(name|version|description|author|homepage|update_url)\s+(.+?)\s*$/,
    );
    if (!m) continue;
    const rawKey = m[1]!;
    let value = m[2]!.trim();
    // 部分音源写成 @version v1.2.0，去掉前缀便于统一展示
    if (rawKey === 'version') value = value.replace(/^v+/i, '');
    if (rawKey === 'update_url') {
      meta.updateUrl = value;
      continue;
    }
    meta[rawKey as keyof Omit<LxScriptHeaderMeta, 'updateUrl'>] = value;
  }
  return meta;
}

let lxScriptLoadChain: Promise<unknown> = Promise.resolve();

function toUint8(input: unknown, encoding?: string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    if (encoding === 'hex') {
      const hex = input.replace(/\s+/g, '');
      if (hex.length % 2 !== 0) throw new Error('buffer.from: invalid hex');
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    // 对齐 Node Buffer.from(str, 'binary')：按 latin1 字节
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input.charCodeAt(i) & 0xff;
    return out;
  }
  if (Array.isArray(input)) return new Uint8Array(input);
  if (input && typeof (input as ArrayBuffer).byteLength === 'number') {
    return new Uint8Array(input as ArrayBuffer);
  }
  throw new Error('buffer.from: unsupported input');
}

/** 对齐 Node Buffer / lx-music：string 按 UTF-8，Uint8Array 按原始字节 */
function toWordArray(input: unknown): CryptoJS.lib.WordArray {
  if (typeof input === 'string') return CryptoJS.enc.Utf8.parse(input);
  const u8 = toUint8(input);
  const latin1: string[] = [];
  for (let i = 0; i < u8.length; i++) latin1.push(String.fromCharCode(u8[i]!));
  return CryptoJS.enc.Latin1.parse(latin1.join(''));
}

/**
 * 对齐 lx-music：`aesEncrypt(buffer, mode, key, iv)`
 * 脚本侧常传入 string（eapi），不能对 string 做 `String.fromCharCode(...key)`。
 */
function aesEncrypt(
  buffer: unknown,
  mode: string,
  key: unknown,
  iv: unknown,
): Uint8Array {
  const plain = toWordArray(buffer);
  const keyWa = toWordArray(key);
  const modeLower = String(mode ?? '').toLowerCase();
  const useCbc = modeLower.includes('cbc');
  const encrypted = useCbc
    ? CryptoJS.AES.encrypt(plain, keyWa, {
        iv: toWordArray(iv ?? ''),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      })
    : CryptoJS.AES.encrypt(plain, keyWa, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      });
  const words = encrypted.ciphertext.words;
  const sigBytes = encrypted.ciphertext.sigBytes;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function rsaEncrypt(buffer: Uint8Array, keyPem: string): Uint8Array {
  const padded = new Uint8Array(128);
  padded.set(buffer, 128 - buffer.length);
  const publicKey = forge.pki.publicKeyFromPem(keyPem);
  const encrypted = publicKey.encrypt(
    String.fromCharCode(...padded),
    'RAW',
  );
  const out = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) out[i] = encrypted.charCodeAt(i);
  return out;
}

export function createLxUserApiEnvironment(meta: {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  updateUrl?: string;
  rawScript: string;
  /** 对齐 lx allowShowUpdateAlert；默认允许 */
  allowShowUpdateAlert?: boolean;
}): {
  lx: LxGlobal;
  initPromise: Promise<LxUserApiSourceInfo>;
  invokeRequest: (data: LxRequestPayload) => Promise<unknown>;
  rejectInit: (err: Error) => void;
} {
  let requestHandler: LxRequestHandler | null = null;
  let initResolve!: (info: LxUserApiSourceInfo) => void;
  let initReject!: (err: Error) => void;
  let inited = false;
  /** 对齐 lx preload：每个运行时只允许一次 updateAlert */
  let isShowedUpdateAlert = false;
  /** inited 已发送，但 initPromise 可能仍在等 bootstrap 请求结束（便于 updateAlert） */
  let pendingSourceInfo: LxUserApiSourceInfo | null = null;
  let bootstrapPending = 0;
  let initSettled = false;

  const initPromise = new Promise<LxUserApiSourceInfo>((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
  });

  function settleInit(): void {
    if (initSettled || !pendingSourceInfo) return;
    if (bootstrapPending > 0) return;
    initSettled = true;
    // 对齐 lx：脚本已 send(inited) 即初始化成功。
    // checkUpdate 等 bootstrap 请求的网络失败不再撤销成功状态（否则「全部已启用源」预热会误杀可用源）。
    initResolve(pendingSourceInfo);
  }

  function rejectInit(err: Error): void {
    if (initSettled) return;
    // 对齐 lx onError：仅尚未 inited 时判定初始化失败
    if (!inited) {
      initSettled = true;
      initReject(err);
    }
  }

  const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
  const supportQualitys: Record<string, string[]> = {
    kw: ['128k', '320k', 'flac', 'flac24bit'],
    kg: ['128k', '320k', 'flac', 'flac24bit'],
    tx: ['128k', '320k', 'flac', 'flac24bit'],
    wy: ['128k', '320k', 'flac', 'flac24bit'],
    mg: ['128k', '320k', 'flac', 'flac24bit'],
    local: [],
  };
  const supportActions: Record<string, string[]> = {
    kw: ['musicUrl'],
    kg: ['musicUrl'],
    tx: ['musicUrl'],
    wy: ['musicUrl'],
    mg: ['musicUrl'],
    xm: ['musicUrl'],
    local: ['musicUrl', 'lyric', 'pic'],
  };

  const lx: LxGlobal = {
    EVENT_NAMES: LX_EVENT_NAMES,
    request(url, options, callback) {
      let aborted = false;
      const method = (options.method ?? 'get').toUpperCase() as 'GET' | 'POST';
      const headers = { ...(options.headers ?? {}) };
      let reqBody: string | undefined;
      if (options.body) {
        reqBody = options.body;
      } else if (options.form) {
        reqBody = new URLSearchParams(options.form).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (options.formData) {
        reqBody = new URLSearchParams(options.formData).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      const timeoutMs =
        typeof options.timeout === 'number' && options.timeout > 0
          ? Math.min(options.timeout, 60_000)
          : 60_000;

      // 记录 init 完成前发出的请求：失败则整次初始化失败（ikun checkUpdate 等）
      const tracksBootstrap = !inited && !initSettled;
      if (tracksBootstrap) bootstrapPending++;
      let bootstrapReleased = false;
      const releaseBootstrap = () => {
        if (!tracksBootstrap || bootstrapReleased) return;
        bootstrapReleased = true;
        bootstrapPending = Math.max(0, bootstrapPending - 1);
        settleInit();
      };

      void (async () => {
        try {
          // 酷我 Cookie 名会轮换；脚本若用过期 defaultKey 会报 The request is illegal!
          // 对 playUrl 用内置鉴权覆盖 Secret/Cookie，与 lx 可用链路对齐
          if (/kuwo\.cn\/api\/v1\/www\/music\/playUrl/i.test(url)) {
            try {
              const { getKwPlayAuth } = await import('@/lib/media/audio/online/sources/kw');
              const auth = await getKwPlayAuth();
              if (auth) {
                headers.Secret = auth.secret;
                headers.Cookie = auth.cookie;
                headers.cookie = auth.cookie;
              }
            } catch {
              // ignore，继续用脚本自带 Secret
            }
          }
          // 小熊猫等脚本默认 @wy_token null；若 Reader 已登录网易，注入 MUSIC_U 才能解 VIP
          if (/music\.163\.com/i.test(url)) {
            try {
              const { loadAuthSession } = await import(
                '@/lib/media/audio/platform/auth/session'
              );
              const auth = await loadAuthSession('netease');
              const sessionCookie = auth?.cookies?.trim();
              if (sessionCookie && /MUSIC_U\s*=\s*[^;]+/i.test(sessionCookie)) {
                const existing = headers.Cookie || headers.cookie || '';
                if (!/MUSIC_U\s*=\s*[^;\s]+/i.test(existing)) {
                  headers.Cookie = existing
                    ? `${sessionCookie}; ${existing}`
                    : sessionCookie.includes('os=')
                      ? sessionCookie
                      : `${sessionCookie}; os=pc`;
                  delete headers.cookie;
                  console.info('[user-api] inject netease MUSIC_U for', url.slice(0, 60));
                }
              }
            } catch {
              // ignore
            }
          }
          // 统一常见头大小写，避免部分 CDN/网关敏感
          if (headers.cookie && !headers.Cookie) {
            headers.Cookie = headers.cookie;
            delete headers.cookie;
          }

          const requestOpts = {
            method,
            headers,
            body: reqBody,
            timeout: timeoutMs,
            allowNon2xx: true,
            useBackendHttp: true,
            ignorePageNavigationAbort: true,
          } as const;

          let res: Awaited<ReturnType<typeof request>>;
          try {
            res = await request(url, requestOpts);
          } catch (firstErr) {
            const firstMsg =
              firstErr instanceof Error ? firstErr.message : String(firstErr ?? '');
            // 部分更新 CDN（kstore 等）在 download_binary/native-tls 下握手 EOF；再试 plugin-http
            if (isTlsOrSendFailureMessage(firstMsg)) {
              console.warn(
                '[user-api] lx.request backend failed, retry without forced backend',
                url.slice(0, 80),
              );
              try {
                res = await request(url, { ...requestOpts, useBackendHttp: false });
              } catch (retryErr) {
                throw retryErr;
              }
            } else {
              throw firstErr;
            }
          }
          if (aborted) return;
          const raw = await res.text();
          // 对齐 needle：非 JSON 保持字符串；仅 JSON 对象做 data 补齐
          let respBody: unknown = raw;
          const trimmed = raw.trim();
          if (
            trimmed.startsWith('{') ||
            trimmed.startsWith('[')
          ) {
            try {
              const parsed = JSON.parse(raw) as unknown;
              respBody =
                parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? normalizeLxJsonResponseBody(
                      parsed as Record<string, unknown>,
                      res.status,
                    )
                  : parsed;
            } catch {
              respBody = raw;
            }
          } else if (res.status >= 400 && !trimmed) {
            respBody = { ...LX_FAILED_SCRIPT_BODY, code: res.status };
          }
          invokeLxRequestCallback(
            callback,
            null,
            {
              statusCode: res.status,
              statusMessage: res.statusText,
              headers: normalizeLxResponseHeaders(res.headers),
              body: respBody,
              raw,
            },
            respBody,
            tracksBootstrap ? rejectInit : undefined,
          );
        } catch (err) {
          if (!aborted) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (
              isLikelyUpdateCheckUrl(url, meta.updateUrl) ||
              (tracksBootstrap && /\.json(?:\?|#|$)/i.test(url))
            ) {
              console.warn('[user-api] checkUpdate request failed', meta.name, error.message);
              notifyUserApiUpdateCheckFailed({
                scriptId: meta.id,
                scriptName: meta.name,
                updateUrl: meta.updateUrl || url,
                error: error.message,
              });
            }
            // 空壳 resp，避免六音等读 resp.statusCode 抛错
            invokeLxRequestCallback(
              callback,
              error,
              null,
              null,
              tracksBootstrap ? rejectInit : undefined,
            );
          }
        } finally {
          releaseBootstrap();
        }
      })().catch((uncaught) => {
        // 兜底：避免 IIFE 自身未捕获 Promise 冒泡到控制台
        console.warn('[user-api] lx.request internal error', uncaught);
        if (tracksBootstrap && !inited) {
          rejectInit(
            uncaught instanceof Error ? uncaught : new Error(String(uncaught)),
          );
        }
        releaseBootstrap();
      });

      return () => {
        aborted = true;
      };
    },
    async send(eventName, data) {
      if (eventName === LX_EVENT_NAMES.inited) {
        if (inited) throw new Error('Script is inited');
        inited = true;
        const info = (data ?? {}) as {
          sources?: Record<string, { type?: string; actions?: string[]; qualitys?: string[] }>;
        };
        const sourceInfo: LxUserApiSourceInfo = { sources: {} };
        try {
          for (const source of allSources) {
            const userSource = info.sources?.[source];
            if (!userSource || userSource.type !== 'music') continue;
            const qualitys = supportQualitys[source] ?? [];
            const actions = supportActions[source] ?? [];
            sourceInfo.sources[source] = {
              type: 'music',
              actions: actions.filter((a) => userSource.actions?.includes(a)),
              qualitys: qualitys.filter((q) => userSource.qualitys?.includes(q)),
            };
          }
        } catch (err) {
          initSettled = true;
          initReject(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }
        // 等 init 前发出的请求结束；任一失败则初始化失败（如 ikun checkUpdate TLS 失败）
        pendingSourceInfo = sourceInfo;
        settleInit();
        return;
      }
      if (eventName === LX_EVENT_NAMES.updateAlert) {
        // 对齐 lx preload handleShowUpdateAlert
        if (isShowedUpdateAlert) {
          throw new Error('The update alert can only be called once.');
        }
        if (!data || typeof data !== 'object') {
          throw new Error('parameter format error.');
        }
        const payload = data as { log?: unknown; updateUrl?: unknown };
        // data: null（无新版本）时脚本仍可能误调 updateAlert 且无 log —— 静默忽略
        if (!payload.log || typeof payload.log !== 'string') {
          return;
        }
        let log = payload.log;
        if (log.length > 1024) log = `${log.substring(0, 1024)}...`;
        let updateUrl =
          typeof payload.updateUrl === 'string' ? payload.updateUrl : '';
        if (
          updateUrl &&
          (!/^https?:\/\/\S+$/i.test(updateUrl) || updateUrl.length > 1024)
        ) {
          updateUrl = '';
        }
        if (meta.allowShowUpdateAlert === false) {
          console.info('[user-api] updateAlert suppressed (allowShowUpdateAlert=false)', meta.name);
          isShowedUpdateAlert = true;
          return;
        }
        isShowedUpdateAlert = true;
        console.info('[user-api] updateAlert', { log, updateUrl, name: meta.name });
        void notifyUserApiUpdateAlert({
          scriptId: meta.id,
          scriptName: meta.name,
          log,
          updateUrl,
        });
        return;
      }
      throw new Error('The event is not supported: ' + eventName);
    },
    async on(eventName, handler) {
      if (eventName === LX_EVENT_NAMES.request) {
        requestHandler = handler;
        return;
      }
      throw new Error('The event is not supported: ' + eventName);
    },
    utils: {
      crypto: {
        aesEncrypt,
        rsaEncrypt,
        randomBytes(size: number) {
          const buf = new Uint8Array(size);
          crypto.getRandomValues(buf);
          return buf;
        },
        md5(str: string) {
          return CryptoJS.MD5(str).toString();
        },
      },
      buffer: {
        from(...args: unknown[]) {
          // 对齐 Node Buffer.from(value, encoding?)
          return toUint8(args[0], typeof args[1] === 'string' ? args[1] : undefined);
        },
        bufToString(buf: Uint8Array | string, format: string) {
          // 对齐 lx preload：Buffer.from(buf, 'binary').toString(format)
          const u8 = typeof buf === 'string' ? toUint8(buf) : toUint8(buf);
          if (format === 'hex') {
            return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
          }
          if (format === 'base64') {
            let binary = '';
            for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
            return btoa(binary);
          }
          return new TextDecoder().decode(u8);
        },
      },
      zlib: {
        inflate(buf: Uint8Array) {
          return promisifyInflate(buf);
        },
        deflate(data: Uint8Array) {
          return promisifyDeflate(data);
        },
      },
    },
    currentScriptInfo: {
      name: meta.name,
      description: meta.description ?? '',
      version: meta.version ?? '',
      author: meta.author ?? '',
      homepage: meta.homepage ?? '',
      rawScript: meta.rawScript,
    },
    version: '2.0.0',
    env: 'desktop',
  };

  async function invokeRequest(data: LxRequestPayload): Promise<unknown> {
    if (!requestHandler) throw new Error('UserApi request handler not registered');
    const host = globalThis as LxGlobalHost;
    const prevLx = host.lx;
    host.lx = lx;
    try {
      return await Promise.race([
        requestHandler.call(lx, data),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`UserApi ${data.action} 请求超时`)),
            LX_REQUEST_TIMEOUT_MS,
          ),
        ),
      ]);
    } finally {
      if (prevLx === undefined) delete host.lx;
      else host.lx = prevLx;
    }
  }

  return { lx, initPromise, invokeRequest, rejectInit };
}

export async function loadLxUserApiScript(script: {
  id?: string;
  name: string;
  script: string;
  allowShowUpdateAlert?: boolean;
}): Promise<{
  sourceInfo: LxUserApiSourceInfo;
  invokeRequest: (data: LxRequestPayload) => Promise<unknown>;
}> {
  const runLoad = async () => {
    const headerMeta = parseLxScriptHeaderMeta(script.script);
    const env = createLxUserApiEnvironment({
      id: script.id,
      name: headerMeta.name ?? script.name,
      description: headerMeta.description,
      version: headerMeta.version ?? '1',
      author: headerMeta.author,
      homepage: headerMeta.homepage,
      updateUrl: headerMeta.updateUrl,
      rawScript: script.script,
      allowShowUpdateAlert: script.allowShowUpdateAlert !== false,
    });

    const host = globalThis as LxGlobalHost;
    const prevLx = host.lx;
    const prevLxSetup = host.lx_setup;
    host.lx = env.lx;
    host.lx_setup = (
      _key: unknown,
      _id: unknown,
      _name: unknown,
      _description: unknown,
      _version: unknown,
      _author: unknown,
      _homepage: unknown,
      rawScript: unknown,
    ) => {
      delete host.lx_setup;
      if (typeof rawScript === 'string' && rawScript.trim()) {
        const inner = new Function(rawScript);
        inner();
      }
    };

    // 对齐 lx preload：挂到卸载前；仅未 inited 时把 rejection 视为初始化失败
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      // 串行加载下旧运行时的监听器可能仍在 90s 窗口内，只处理当前活跃 lx
      if (host.lx !== env.lx) return;
      env.rejectInit(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
      );
      // 已处理：抑制控制台 Uncaught（checkUpdate / updateAlert 等脚本内未 catch 的 Promise）
      event.preventDefault();
    };
    globalThis.addEventListener('unhandledrejection', onUnhandledRejection);

    try {
      const runner = new Function(script.script);
      runner();

      const sourceInfo = await Promise.race([
        env.initPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('UserApi 初始化超时')), 30_000),
        ),
      ]);

      return { sourceInfo, invokeRequest: env.invokeRequest };
    } finally {
      // 延迟卸载监听与还原 lx：checkUpdate / updateAlert 常在 inited 之后异步触发
      window.setTimeout(() => {
        globalThis.removeEventListener('unhandledrejection', onUnhandledRejection);
        if (host.lx === env.lx) {
          if (prevLx === undefined) delete host.lx;
          else host.lx = prevLx;
        }
        if (host.lx_setup !== undefined && prevLxSetup === undefined) {
          // lx_setup 通常已在脚本内 delete；无操作
        }
      }, 90_000);
    }
  };

  const result = lxScriptLoadChain.then(runLoad, runLoad);
  lxScriptLoadChain = result.catch(() => {});
  return result;
}
