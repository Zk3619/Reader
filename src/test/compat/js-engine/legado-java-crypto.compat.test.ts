import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  legadoAesBase64DecodeToString,
  legadoJavaGetWebViewUA,
} from '@/lib/js-engine/legado/legado-java-crypto';

describe('legado-java-crypto', () => {
  it('legadoJavaGetWebViewUA 解析 header JSON', () => {
    const ua = legadoJavaGetWebViewUA(
      JSON.stringify({ 'User-Agent': 'TestUA/1.0' }),
    );
    expect(ua).toBe('TestUA/1.0');
  });

  it('legadoAesBase64DecodeToString AES/ECB/PKCS7', () => {
    const key = 'test-key-16bytes';
    const plain = "'ged520'";
    const encrypted = CryptoJS.AES.encrypt(plain, CryptoJS.enc.Utf8.parse(key), {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64);
    const out = legadoAesBase64DecodeToString(
      encrypted,
      key,
      'AES/ECB/PKCS7Padding',
      '',
    );
    expect(out).toBe(plain);
  });
});
