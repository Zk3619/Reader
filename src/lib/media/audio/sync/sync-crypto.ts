/**
 * LX Sync 加解密工具（对齐 lx-music-sync-server tools.ts）
 */

import CryptoJS from 'crypto-js';
import forge from 'node-forge';

export const SYNC_HELLO = 'Hello~::^-^::~v4~';
export const SYNC_ID_PREFIX = 'OjppZDo6';
export const SYNC_AUTH_MSG = 'lx-music auth::';
export const SYNC_CONNECT_MSG = 'lx-music connect';

export function md5Hex(text: string): string {
  return CryptoJS.MD5(text).toString();
}

export function passwordAesKey(password: string): string {
  const hex = md5Hex(password).substring(0, 16);
  return forge.util.encode64(hex);
}

export function aesEncrypt(text: string, key: string): string {
  return CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
}

export function aesDecrypt(text: string, key: string): string {
  return CryptoJS.AES.decrypt(text, CryptoJS.enc.Utf8.parse(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);
}

export async function gzipText(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `cg_${b64}`;
}

export async function gunzipText(enMsg: string): Promise<string> {
  if (!enMsg.startsWith('cg_')) return enMsg;
  const raw = atob(enMsg.slice(3));
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (typeof DecompressionStream === 'undefined') return enMsg;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function encryptMsg(msg: string, key?: string): Promise<string> {
  if (msg.length > 1024 && typeof CompressionStream !== 'undefined') {
    return gzipText(msg);
  }
  if (key) return aesEncrypt(msg, key);
  return msg;
}

export async function decryptMsg(enMsg: string, key?: string): Promise<string> {
  if (enMsg.startsWith('cg_')) return gunzipText(enMsg);
  if (key) return aesDecrypt(enMsg, key);
  return enMsg;
}

export function generateRsaKeyPair(): { publicKey: string; privateKey: string } {
  const pair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const publicKey = forge.pki.publicKeyToPem(pair.publicKey);
  const privateKey = forge.pki.privateKeyToPem(pair.privateKey);
  return { publicKey, privateKey };
}

export function rsaDecrypt(cipherB64: string, privateKeyPem: string): string {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const bytes = forge.util.decode64(cipherB64);
  const decrypted = privateKey.decrypt(bytes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return decrypted;
}

export function rsaEncrypt(plain: string, publicKeyPem: string): string {
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = publicKey.encrypt(plain, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return forge.util.encode64(encrypted);
}

export interface LxClientKeyInfo {
  clientId: string;
  key: string;
  serverName?: string;
}
