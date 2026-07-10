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
  return (
    /globalThis\.lx\b/.test(script) ||
    /\blx_setup\b/.test(script) ||
    /\blx\.send\s*\(\s*['"]inited['"]/.test(script)
  );
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

type LxGlobalHost = typeof globalThis & { lx?: LxGlobal };

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
} {
  let requestHandler: LxRequestHandler | null = null;
  let initResolve!: (info: LxUserApiSourceInfo) => void;
  let initReject!: (err: Error) => void;
  let inited = false;

  const initPromise = new Promise<LxUserApiSourceInfo>((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
  });

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
    return requestHandler(lx, data);
  }

  return { lx, initPromise, invokeRequest };
}

export async function loadLxUserApiScript(script: {
  name: string;
  script: string;
}): Promise<{
  sourceInfo: LxUserApiSourceInfo;
  invokeRequest: (data: LxRequestPayload) => Promise<unknown>;
}> {
  const env = createLxUserApiEnvironment({
    name: script.name,
    rawScript: script.script,
  });

  const host = globalThis as LxGlobalHost;
  const prevLx = host.lx;
  host.lx = env.lx;

  try {
    const runner = new Function(script.script);
    runner();

    const sourceInfo = await Promise.race([
      env.initPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('UserApi 初始化超时')), 15_000),
      ),
    ]);

    if (prevLx === undefined) delete host.lx;
    else host.lx = prevLx;

    return { sourceInfo, invokeRequest: env.invokeRequest };
  } catch (err) {
    if (prevLx === undefined) delete host.lx;
    else host.lx = prevLx;
    throw err;
  }
}
