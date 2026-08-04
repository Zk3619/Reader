/**
 * 浏览器端替代 Node `crypto` / `node:crypto`。
 * Vite 将二者 alias 到此模块，须提供命名导出，否则任意
 * `import { createHash } from 'node:crypto'` 会在模块图加载期直接 SyntaxError，拖垮整站。
 */
import CryptoJS from 'crypto-js';

function bytesToWordArray(data: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    words.push(
      ((((data[i] ?? 0) << 24) |
        ((data[i + 1] ?? 0) << 16) |
        ((data[i + 2] ?? 0) << 8) |
        (data[i + 3] ?? 0)) >>>
        0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, data.length);
}

function wordArrayToBytes(wa: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wa;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function toWordArray(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): CryptoJS.lib.WordArray {
  if (typeof data === 'string') {
    return CryptoJS.enc.Utf8.parse(data);
  }
  if (data instanceof ArrayBuffer) {
    return bytesToWordArray(new Uint8Array(data));
  }
  if (ArrayBuffer.isView(data)) {
    return bytesToWordArray(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  return bytesToWordArray(data);
}

class BrowserHash {
  private chunks: CryptoJS.lib.WordArray[] = [];

  constructor(private readonly algorithm: string) {}

  update(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): this {
    this.chunks.push(toWordArray(data));
    return this;
  }

  digest(): Uint8Array {
    let payload = CryptoJS.lib.WordArray.create();
    for (const part of this.chunks) {
      payload = payload.concat(part);
    }
    const algo = this.algorithm.toLowerCase().replace('-', '');
    let hash: CryptoJS.lib.WordArray;
    switch (algo) {
      case 'sha1':
        hash = CryptoJS.SHA1(payload);
        break;
      case 'sha256':
        hash = CryptoJS.SHA256(payload);
        break;
      case 'sha512':
        hash = CryptoJS.SHA512(payload);
        break;
      case 'md5':
        hash = CryptoJS.MD5(payload);
        break;
      default:
        throw new Error(`[stubs/node-crypto] Unsupported hash algorithm: ${this.algorithm}`);
    }
    return wordArrayToBytes(hash);
  }
}

export function createHash(algorithm: string): BrowserHash {
  return new BrowserHash(algorithm);
}

export function randomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomInt(min: number, max?: number): number {
  const lo = max === undefined ? 0 : min;
  const hi = max === undefined ? min : max;
  const span = hi - lo;
  if (span <= 0) return lo;
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return lo + (buf[0]! % span);
  }
  return lo + Math.floor(Math.random() * span);
}

class BrowserHmac {
  private chunks: CryptoJS.lib.WordArray[] = [];

  constructor(
    private readonly algorithm: string,
    private readonly key: string | Uint8Array,
  ) {}

  update(data: string | Uint8Array | ArrayBuffer | ArrayBufferView): this {
    this.chunks.push(toWordArray(data));
    return this;
  }

  digest(encoding?: 'hex' | 'base64'): string | Uint8Array {
    let payload = CryptoJS.lib.WordArray.create();
    for (const part of this.chunks) payload = payload.concat(part);
    const keyWa = typeof this.key === 'string' ? CryptoJS.enc.Utf8.parse(this.key) : toWordArray(this.key);
    const algo = this.algorithm.toLowerCase().replace('-', '');
    let hash: CryptoJS.lib.WordArray;
    switch (algo) {
      case 'sha1':
        hash = CryptoJS.HmacSHA1(payload, keyWa);
        break;
      case 'sha256':
        hash = CryptoJS.HmacSHA256(payload, keyWa);
        break;
      case 'sha512':
        hash = CryptoJS.HmacSHA512(payload, keyWa);
        break;
      case 'md5':
        hash = CryptoJS.HmacMD5(payload, keyWa);
        break;
      default:
        throw new Error(`[stubs/node-crypto] Unsupported hmac algorithm: ${this.algorithm}`);
    }
    if (encoding === 'hex') return hash.toString(CryptoJS.enc.Hex);
    if (encoding === 'base64') return hash.toString(CryptoJS.enc.Base64);
    return wordArrayToBytes(hash);
  }
}

export function createHmac(algorithm: string, key: string | Uint8Array): BrowserHmac {
  return new BrowserHmac(algorithm, key);
}

/** RSA 等能力未在浏览器 stub 中实现；导出仅为避免 import 期崩溃。 */
export function generateKeyPairSync(
  _type: string,
  _options?: { modulusLength?: number },
): never {
  throw new Error(
    '[stubs/node-crypto] generateKeyPairSync is unavailable in the browser runtime',
  );
}

export function privateDecrypt(
  _options: unknown,
  _buffer: Uint8Array,
): never {
  throw new Error(
    '[stubs/node-crypto] privateDecrypt is unavailable in the browser runtime',
  );
}

export const constants = {
  RSA_PKCS1_OAEP_PADDING: 4,
  RSA_PKCS1_PADDING: 1,
} as const;

export default {
  createHash,
  createHmac,
  randomUUID,
  randomInt,
  generateKeyPairSync,
  privateDecrypt,
  constants,
};
