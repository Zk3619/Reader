/**
 * Protocol / FD surface — P5 protocol 100%.
 */
import { describe, expect, it } from 'vitest';
import {
  extractBoxData,
  trackIdFromFragment,
  writePiffHeader,
} from '@/lib/download/ytdlp/ism-native';
import { md5Hex } from '@/lib/download/ytdlp/md5';
import {
  detectSpecialProtocol,
} from '@/lib/download/ytdlp/special-protocols';
import {
  isRtmpDumpProtocol,
  unsupportedProtocolMessage,
} from '@/lib/download/ytdlp/protocol-policy';
import { parseExternalDownloader } from '@/lib/download/ytdlp/external-downloader';

describe('ism-native PIFF', () => {
  it('writes ftyp+moov header with isml brand', () => {
    const header = writePiffHeader({
      stream_type: 'video',
      fourcc: 'H264',
      duration: 10_000_000,
      timescale: 10_000_000,
      width: 1280,
      height: 720,
      track_id: 1,
      language: 'und',
      codec_private_data:
        '000000016742E01EAAAAAAAAAAAAAAAA0000000168CE06E2',
    });
    expect(header.length).toBeGreaterThan(100);
    const type = String.fromCharCode(...header.slice(4, 8));
    expect(type).toBe('ftyp');
    const brand = String.fromCharCode(...header.slice(8, 12));
    expect(brand).toBe('isml');
  });

  it('extracts nested box payload', () => {
    // size=16 type=moof + size=8 type=traf + empty
    const moofInner = new Uint8Array([
      0, 0, 0, 8, 0x74, 0x66, 0x68, 0x64, // tfhd empty — wrong nesting; build properly
    ]);
    // Build: moof( traf( tfhd( flags+track_id ) ) )
    const tfhdPayload = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 7]); // version/flags + track_id=7
    const tfhd = new Uint8Array(8 + tfhdPayload.length);
    new DataView(tfhd.buffer).setUint32(0, tfhd.length);
    tfhd.set([0x74, 0x66, 0x68, 0x64], 4);
    tfhd.set(tfhdPayload, 8);
    const traf = new Uint8Array(8 + tfhd.length);
    new DataView(traf.buffer).setUint32(0, traf.length);
    traf.set([0x74, 0x72, 0x61, 0x66], 4);
    traf.set(tfhd, 8);
    const moof = new Uint8Array(8 + traf.length);
    new DataView(moof.buffer).setUint32(0, moof.length);
    moof.set([0x6d, 0x6f, 0x6f, 0x66], 4);
    moof.set(traf, 8);

    const got = extractBoxData(moof, ['moof', 'traf', 'tfhd']);
    expect(got).not.toBeNull();
    expect(trackIdFromFragment(moof)).toBe(7);
    void moofInner;
  });
});

describe('special / policy / external', () => {
  it('detects soopvod alias and live_chat', () => {
    expect(detectSpecialProtocol('soopvod')).toBe('soop_vod');
    expect(detectSpecialProtocol('soop_vod')).toBe('soop_vod');
    expect(detectSpecialProtocol('youtube_live_chat')).toBe('youtube_live_chat');
    expect(detectSpecialProtocol('youtube_live_chat_replay')).toBe('youtube_live_chat_replay');
    expect(detectSpecialProtocol('rtmpe', 'rtmpe://x')).toBe('rtmpe');
  });

  it('rtmpe allowed only with allowRtmpDump', () => {
    expect(unsupportedProtocolMessage('rtmpe')).toMatch(/rtmpdump/);
    expect(
      unsupportedProtocolMessage('rtmpe', undefined, { allowRtmpDump: true }),
    ).toBeNull();
    expect(isRtmpDumpProtocol('rtmpt')).toBe(true);
  });

  it('parses axel / httpie / rtmpdump external kinds', () => {
    expect(parseExternalDownloader('axel')).toBe('axel');
    expect(parseExternalDownloader('httpie')).toBe('httpie');
    expect(parseExternalDownloader('rtmpdump')).toBe('rtmpdump');
  });

  it('md5Hex matches known vector', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});
