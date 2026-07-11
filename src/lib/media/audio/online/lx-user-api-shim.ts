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

type LxRequestHandler = (
  ctx: LxGlobal,
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
      resp: {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
        body: unknown;
        raw: string;
      } | null,
      body: unknown,
    ) => void,
  ) => () => void;
  send: (eventName: string, data?: unknown) => Promise<void>;
  on: (eventName: string, handler: LxRequestHandler) => Promise<void>;
  utils: {
    crypto: {
      aesEncrypt: (buffer: Uint8Array, mode: string, key: Uint8Array, iv: Uint8Array) => Uint8Array;
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
};

/** 解析 LX UserApi 脚本头部 @name / @version 等注释 */
export function parseLxScriptHeaderMeta(script: string): LxScriptHeaderMeta {
  const meta: LxScriptHeaderMeta = {};
  const head = script.slice(0, 4096);
  for (const line of head.split('\n')) {
    const m = line.match(/^\s*\*\s*@(name|version|description|author|homepage)\s+(.+?)\s*$/);
    if (!m) continue;
    const key = m[1] as keyof LxScriptHeaderMeta;
    meta[key] = m[2].trim();
  }
  return meta;
}

let lxScriptLoadChain: Promise<unknown> = Promise.resolve();

function toUint8(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input.charCodeAt(i);
    return out;
  }
  if (Array.isArray(input)) return new Uint8Array(input);
  throw new Error('buffer.from: unsupported input');
}

function aesEncrypt(
  buffer: Uint8Array,
  mode: string,
  key: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  const keyStr = String.fromCharCode(...key);
  const ivStr = String.fromCharCode(...iv);
  const plain = CryptoJS.lib.WordArray.create(buffer as unknown as number[]);
  const encrypted =
    mode.includes('CBC') || mode.includes('PKCS7')
      ? CryptoJS.AES.encrypt(plain, CryptoJS.enc.Latin1.parse(keyStr), {
          iv: CryptoJS.enc.Latin1.parse(ivStr),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        })
      : CryptoJS.AES.encrypt(plain, CryptoJS.enc.Latin1.parse(keyStr), {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.NoPadding,
        });
  const words = encrypted.ciphertext.words;
  const sigBytes = encrypted.ciphertext.sigBytes;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
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
  name: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  rawScript: string;
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

  const initPromise = new Promise<LxUserApiSourceInfo>((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
  });

  function rejectInit(err: Error): void {
    if (!inited) initReject(err);
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
      let body: string | undefined;
      if (options.body) {
        body = options.body;
      } else if (options.form) {
        body = new URLSearchParams(options.form).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (options.formData) {
        body = new URLSearchParams(options.formData).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      const timeoutMs =
        typeof options.timeout === 'number' && options.timeout > 0
          ? Math.min(options.timeout, 60_000)
          : 60_000;

      void (async () => {
        try {
          const res = await request(url, { method, headers, body, timeout: timeoutMs });
          if (aborted) return;
          const raw = await res.text();
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // keep raw string
          }
          callback(null, {
            statusCode: res.status,
            statusMessage: res.statusText,
            headers: res.headers,
            body: parsed,
            raw,
          }, parsed);
        } catch (err) {
          if (!aborted) callback(err instanceof Error ? err : new Error(String(err)), null, null);
        }
      })();

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
          initReject(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }
        initResolve(sourceInfo);
        return;
      }
      if (eventName === LX_EVENT_NAMES.updateAlert) {
        console.info('[user-api] updateAlert', data);
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
          return toUint8(args[0]);
        },
        bufToString(buf: Uint8Array, format: string) {
          if (format === 'hex') {
            return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
          }
          return new TextDecoder().decode(buf);
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
      return await requestHandler(lx, data);
    } finally {
      if (prevLx === undefined) delete host.lx;
      else host.lx = prevLx;
    }
  }

  return { lx, initPromise, invokeRequest, rejectInit };
}

export async function loadLxUserApiScript(script: {
  name: string;
  script: string;
}): Promise<{
  sourceInfo: LxUserApiSourceInfo;
  invokeRequest: (data: LxRequestPayload) => Promise<unknown>;
}> {
  const runLoad = async () => {
    const headerMeta = parseLxScriptHeaderMeta(script.script);
    const env = createLxUserApiEnvironment({
      name: headerMeta.name ?? script.name,
      description: headerMeta.description,
      version: headerMeta.version ?? '1',
      author: headerMeta.author,
      homepage: headerMeta.homepage,
      rawScript: script.script,
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

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      env.rejectInit(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      );
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
      globalThis.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (prevLx === undefined) delete host.lx;
      else host.lx = prevLx;
      if (prevLxSetup === undefined) delete host.lx_setup;
      else host.lx_setup = prevLxSetup;
    }
  };

  const result = lxScriptLoadChain.then(runLoad, runLoad);
  lxScriptLoadChain = result.catch(() => {});
  return result;
}
