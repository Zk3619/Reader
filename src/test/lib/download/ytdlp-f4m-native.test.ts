import { describe, expect, it } from 'vitest';
import {
  buildF4mFragments,
  extractF4mMdat,
  makeFlvHeader,
  readF4mBootstrapInfo,
} from '@/lib/download/ytdlp/f4m-native';

function writeU32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function writeBox(type: string, data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const out = new Uint8Array(size);
  out.set(writeU32(size));
  out.set(new TextEncoder().encode(type).subarray(0, 4), 4);
  out.set(data, 8);
  return out;
}

function buildAsrt(firstSegment = 1, fragmentsPerSegment = 2): Uint8Array {
  const body = new Uint8Array(17);
  let offset = 0;
  body[offset++] = 0;
  offset += 3;
  body[offset++] = 0;
  new DataView(body.buffer).setUint32(offset, 1, false);
  offset += 4;
  new DataView(body.buffer).setUint32(offset, firstSegment, false);
  offset += 4;
  new DataView(body.buffer).setUint32(offset, fragmentsPerSegment, false);
  return writeBox('asrt', body);
}

function buildAfrt(first = 1): Uint8Array {
  const body = new Uint8Array(29);
  let offset = 0;
  body[offset++] = 0;
  offset += 3;
  new DataView(body.buffer).setUint32(offset, 1000, false);
  offset += 4;
  body[offset++] = 0;
  new DataView(body.buffer).setUint32(offset, 1, false);
  offset += 4;
  new DataView(body.buffer).setUint32(offset, first, false);
  offset += 4;
  new DataView(body.buffer).setBigUint64(offset, BigInt(0), false);
  offset += 8;
  new DataView(body.buffer).setUint32(offset, 1000, false);
  return writeBox('afrt', body);
}

function buildAbst(live = false): Uint8Array {
  const chunks: number[] = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    live ? 0x20 : 0,
    0, 0, 3, 0xe8,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0,
    0,
    0,
    0,
    0,
    1,
  ];
  const prefix = Uint8Array.from(chunks);
  const tail = new Uint8Array([1]);
  const body = new Uint8Array(prefix.length + buildAsrt().length + tail.length + buildAfrt().length);
  body.set(prefix);
  body.set(buildAsrt(), prefix.length);
  body.set(tail, prefix.length + buildAsrt().length);
  body.set(buildAfrt(), prefix.length + buildAsrt().length + tail.length);
  return writeBox('abst', body);
}

describe('f4m-native', () => {
  it('parses abst/asrt/afrt and builds fragment refs', () => {
    const bootstrap = readF4mBootstrapInfo(buildAbst(false));
    expect(bootstrap.live).toBe(false);
    const fragments = buildF4mFragments(bootstrap);
    expect(fragments).toEqual([
      { segment: 1, fragment: 1 },
      { segment: 1, fragment: 2 },
    ]);
  });

  it('extracts mdat payload from fragment box', () => {
    const payload = new TextEncoder().encode('hello-hds');
    const mdat = writeBox('mdat', payload);
    expect(extractF4mMdat(mdat)).toEqual(payload);
  });

  it('writes FLV header', () => {
    const header = makeFlvHeader();
    expect(header[0]).toBe(0x46);
    expect(header[1]).toBe(0x4c);
    expect(header[2]).toBe(0x56);
  });
});
