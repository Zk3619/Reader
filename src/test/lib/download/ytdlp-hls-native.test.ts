import { describe, expect, it } from 'vitest';
import {
  isHlsMediaPlaylist,
  mediaPlaylistNeedsNativeAes,
  parseHlsMediaPlaylist,
  parseM3u8Attributes,
} from '@/lib/download/ytdlp/hls-native';
import { aes128CbcDecrypt } from '@/lib/download/ytdlp/aes';
import CryptoJS from 'crypto-js';

describe('hls-native', () => {
  it('parses KEY attributes', () => {
    const attrs = parseM3u8Attributes(
      'METHOD=AES-128,URI="https://cdn.example/key.bin",IV=0x0000000000000000000000000000002A',
    );
    expect(attrs.METHOD).toBe('AES-128');
    expect(attrs.URI).toBe('https://cdn.example/key.bin');
    expect(attrs.IV?.toLowerCase()).toContain('2a');
  });

  it('detects media playlist + AES-128', () => {
    const man = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:5
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:9.0,
seg0.ts
#EXTINF:9.0,
seg1.ts
#EXT-X-ENDLIST
`;
    expect(isHlsMediaPlaylist(man)).toBe(true);
    expect(mediaPlaylistNeedsNativeAes(man)).toBe(true);
    const parsed = parseHlsMediaPlaylist(man, 'https://cdn.example/pl.m3u8');
    expect(parsed.fragments).toHaveLength(2);
    expect(parsed.fragments[0]!.mediaSequence).toBe(5);
    expect(parsed.fragments[0]!.decrypt.method).toBe('AES-128');
    expect(parsed.fragments[0]!.decrypt.keyUri).toBe('https://cdn.example/key.bin');
    expect(parsed.fragments[1]!.url).toBe('https://cdn.example/seg1.ts');
  });

  it('decrypts AES-128 segment with media-sequence IV', () => {
    const key = new Uint8Array(16).fill(0x11);
    const iv = new Uint8Array(16);
    new DataView(iv.buffer).setUint32(12, 5, false);
    const plain = new TextEncoder().encode('SEGMENTDATA!!!!'); // 16 bytes
    const wa = CryptoJS.lib.WordArray.create(
      Array.from({ length: 4 }, (_, i) => {
        const o = i * 4;
        return (
          ((plain[o]! << 24) |
            ((plain[o + 1]! ?? 0) << 16) |
            ((plain[o + 2]! ?? 0) << 8) |
            (plain[o + 3]! ?? 0)) >>>
          0
        );
      }),
      16,
    );
    const keyWa = CryptoJS.lib.WordArray.create(
      Array.from({ length: 4 }, () => 0x11111111),
      16,
    );
    const ivWa = CryptoJS.lib.WordArray.create(
      [0, 0, 0, 5],
      16,
    );
    const enc = CryptoJS.AES.encrypt(wa, keyWa, {
      iv: ivWa,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const cipher = new Uint8Array(enc.ciphertext.sigBytes);
    for (let i = 0; i < cipher.length; i++) {
      cipher[i] = (enc.ciphertext.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
    }
    const out = aes128CbcDecrypt(cipher, key, iv);
    expect(new TextDecoder().decode(out).replace(/\0+$/, '')).toBe('SEGMENTDATA!!!!');
  });
});
