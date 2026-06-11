/**
 * Legado java.aesBase64DecodeToString（AES/ECB/PKCS7Padding 等）
 */
import CryptoJS from 'crypto-js';

const DEFAULT_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

/** 对齐 Legado AnalyzeUrl / WebView UA；header 为 JSON 时优先取 User-Agent */
export function legadoJavaGetWebViewUA(header?: string | null): string {
  const raw = header?.trim();
  if (!raw) return DEFAULT_WEBVIEW_UA;
  if (raw.startsWith('@js:')) return DEFAULT_WEBVIEW_UA;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const ua = parsed['User-Agent'] ?? parsed['user-agent'];
    if (ua?.trim()) return ua.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_WEBVIEW_UA;
}

/**
 * Legado Encodes.kt aesBase64DecodeToString
 * @param data Base64 密文
 * @param key 密钥字符串（UTF-8）
 * @param transformation 如 AES/ECB/PKCS7Padding
 */
export function legadoJavaMd5Encode(input: string): string {
  return CryptoJS.MD5(String(input ?? '')).toString(CryptoJS.enc.Hex);
}

export function legadoAesBase64DecodeToString(
  data: string,
  key: string,
  transformation: string,
  _iv = '',
): string {
  const cipher = String(data ?? '').trim();
  const secret = String(key ?? '');
  if (!cipher || !secret) return '';
  const mode = String(transformation ?? '').toUpperCase();
  if (!mode.includes('AES') || !mode.includes('ECB')) {
    console.warn('[legado-java-crypto] 暂不支持的 transformation:', transformation);
    return '';
  }
  try {
    const keyWords = CryptoJS.enc.Utf8.parse(secret);
    const decrypted = CryptoJS.AES.decrypt(cipher, keyWords, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.warn('[legado-java-crypto] aesBase64DecodeToString failed', e);
    return '';
  }
}
