import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import { aes128CbcDecrypt, aesDecryptText } from '@/lib/download/ytdlp/aes';

describe('ytdlp aes', () => {
  it('aes128CbcDecrypt round-trips CBC payload', () => {
    const key = CryptoJS.enc.Hex.parse('00112233445566778899aabbccddeeff');
    const iv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
    const plain = 'https://example.com/video.mp4';
    const encrypted = CryptoJS.AES.encrypt(plain, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const cipher = new Uint8Array(
      encrypted.ciphertext.words.flatMap((w) => [
        (w >>> 24) & 0xff,
        (w >>> 16) & 0xff,
        (w >>> 8) & 0xff,
        w & 0xff,
      ]).slice(0, encrypted.ciphertext.sigBytes),
    );
    const keyBytes = new Uint8Array(16);
    const ivBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      keyBytes[i] = (key.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
      ivBytes[i] = (iv.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
    }
    const out = aes128CbcDecrypt(cipher, keyBytes, ivBytes);
    expect(new TextDecoder().decode(out)).toBe(plain);
  });

  it('aesDecryptText matches yt-dlp Python reference vector', () => {
    const b64 = 'AQIDBAUGBwigBm5/03lZFgcvfTbkyai7t5iHTGYHqaBHffpOIYNXiQ==';
    expect(aesDecryptText(b64, 'test title', 32)).toBe('https://cdn.example.com/clip.mp4');
  });
});
