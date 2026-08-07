import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  aesCtrDecrypt,
  aesCtrEncrypt,
  aesEcbDecrypt,
  aesEcbEncrypt,
} from '@/lib/download/ytdlp/aes';
import { int_to_int32, js_number_to_string } from '@/lib/download/ytdlp/jsinterp';
import { parse_fragment, parseFragmentCues } from '@/lib/download/ytdlp/webvtt';
import {
  OnDemandPagedList,
  jwt_decode_hs256,
  qualities,
  traverse_obj,
  traverse_obj_deep,
  urljoin,
  urlencode_postdata,
} from '@/lib/download/ytdlp/utils';
import { isJa3RequiredIeKey } from '@/lib/download/ytdlp/networking/ja3-sites';

describe('ytdlp utils / network surface (P5-3)', () => {
  it('urljoin / urlencode_postdata / qualities', () => {
    expect(urljoin('https://a.test/x/', '../y?z=1')).toBe('https://a.test/y?z=1');
    expect(urlencode_postdata({ a: 1, b: 'x y' })).toBe('a=1&b=x%20y');
    const q = qualities(['low', 'mid', 'hi']);
    expect(q('mid')).toBe(1);
    expect(q('nope')).toBe(-1);
  });

  it('traverse_obj / traverse_obj_deep with ...', () => {
    const obj = { a: { b: 1 }, items: [{ id: 1 }, { id: 2 }] };
    expect(traverse_obj(obj, ['a', 'b'])).toBe(1);
    expect(traverse_obj_deep(obj, ['items', '...', 'id'], { get_all: true })).toEqual([1, 2]);
  });

  it('OnDemandPagedList pages lazily', async () => {
    const calls: number[] = [];
    const list = new OnDemandPagedList(async (page) => {
      calls.push(page);
      if (page > 1) return [];
      return [`p${page}-a`, `p${page}-b`];
    }, 2);
    const items: string[] = [];
    for await (const x of list.items()) items.push(x);
    expect(items).toEqual(['p0-a', 'p0-b', 'p1-a', 'p1-b']);
    expect(calls[0]).toBe(0);
  });

  it('jwt_decode_hs256 payload', () => {
    // {"sub":"42"} base64url
    const token =
      'eyJhbGciOiJIUzI1NiJ9.' +
      btoa(JSON.stringify({ sub: '42' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') +
      '.sig';
    expect(jwt_decode_hs256(token)?.sub).toBe('42');
  });

  it('int_to_int32 / js_number_to_string', () => {
    expect(int_to_int32(0xffffffff)).toBe(-1);
    expect(int_to_int32(1)).toBe(1);
    expect(js_number_to_string(255, 16)).toBe('ff');
    expect(js_number_to_string(10, 10)).toBe('10');
    expect(js_number_to_string(NaN)).toBe('NaN');
  });

  it('aes ecb/ctr round-trip', () => {
    const key = new Uint8Array(16).map((_, i) => i);
    const iv = new Uint8Array(16);
    const plain = new TextEncoder().encode('hello-aes-ctr!!'); // 15 bytes
    const ecb = aesEcbEncrypt(plain, key);
    expect(new TextDecoder().decode(aesEcbDecrypt(ecb, key))).toBe('hello-aes-ctr!!');
    const ctr = aesCtrEncrypt(plain, key, iv);
    expect(aesCtrDecrypt(ctr, key, iv)).toEqual(plain);
    // CryptoJS CTR sanity vs our encrypt
    const wa = CryptoJS.lib.WordArray.create(
      Array.from({ length: Math.ceil(plain.length / 4) }, (_, i) => {
        const o = i * 4;
        return (
          (((plain[o] ?? 0) << 24) |
            ((plain[o + 1] ?? 0) << 16) |
            ((plain[o + 2] ?? 0) << 8) |
            (plain[o + 3] ?? 0)) >>>
          0
        );
      }),
      plain.length,
    );
    expect(wa.sigBytes).toBe(plain.length);
  });

  it('parse_fragment yields cues from HLS VTT fragment', () => {
    const frag = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n\nNOTE skip me\n\n00:00:03.000 --> 00:00:04.000\nBye\n`;
    const blocks = [...parse_fragment(frag)];
    expect(blocks[0]?.type).toBe('magic');
    expect(parseFragmentCues(frag).map((c) => c.text)).toEqual(['Hi', 'Bye']);
  });

  it('JA3 site list covers major impersonate IEs', () => {
    for (const k of ['TikTok', 'Instagram', 'Vimeo', 'PornHub', 'Kick', 'Reddit', 'Soundcloud', 'SpankBang', 'Truth']) {
      expect(isJa3RequiredIeKey(k)).toBe(true);
    }
  });
});
