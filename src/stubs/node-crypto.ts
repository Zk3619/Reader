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
  generateKeyPairSync,
  privateDecrypt,
  constants,
};
