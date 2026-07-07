/**
 * 备份 AES 加密（对齐 Legado BackupAES：MD5(password)[0:16] 作为 AES-128-ECB 密钥）
 */

import CryptoJS from 'crypto-js';

function deriveAesKey(password: string): CryptoJS.lib.WordArray {
  const md5 = CryptoJS.MD5(password || '').toString(CryptoJS.enc.Hex);
  return CryptoJS.enc.Utf8.parse(md5.slice(0, 16));
}

/** 加密为 Base64 字符串；password 为空时返回原文 */
export function backupAesEncrypt(plainText: string, password: string): string {
  if (!password.trim()) return plainText;
  try {
    const key = deriveAesKey(password);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch {
    return plainText;
  }
}

/** 解密 Base64；失败时返回 null */
export function backupAesDecrypt(cipherText: string, password: string): string | null {
  if (!password.trim()) return cipherText;
  try {
    const key = deriveAesKey(password);
    const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const text = decrypted.toString(CryptoJS.enc.Utf8);
    return text || null;
  } catch {
    return null;
  }
}

/** 判断 servers.json 等内容是否已 AES 加密（非 JSON 数组开头） */
export function looksLikeBackupAesPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('{')) return false;
  return /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, Math.min(32, trimmed.length)));
}

export function decryptBackupJsonIfNeeded(text: string, password: string): string {
  if (!looksLikeBackupAesPayload(text)) return text;
  const decrypted = backupAesDecrypt(text, password);
  return decrypted ?? text;
}
