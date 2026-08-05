/**
 * Adobe HDS bootstrap (abst/asrt/afrt) parser and FLV fragment helpers.
 * Ported from yt-dlp downloader/f4m.py without external programs.
 */

export class F4mDataTruncatedError extends Error {
  constructor(message = 'F4M box data is truncated') {
    super(message);
    this.name = 'F4mDataTruncatedError';
  }
}

export interface F4mSegmentRun {
  firstSegment: number;
  fragmentsPerSegment: number;
}

export interface F4mFragmentRun {
  first: number;
  timestamp: bigint;
  duration: number;
  discontinuityIndicator?: number;
}

export interface F4mBootstrapInfo {
  live: boolean;
  segments: Array<{ segmentRun: F4mSegmentRun[] }>;
  fragments: Array<{ timescale: number; fragments: F4mFragmentRun[] }>;
}

export interface F4mFragmentRef {
  segment: number;
  fragment: number;
}

export class FlvReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  readBytes(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.data.length) {
      throw new F4mDataTruncatedError(
        `FlvReader needs ${length} bytes with ${this.remaining} remaining`,
      );
    }
    const out = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  readU8(): number {
    return this.readBytes(1)[0]!;
  }

  readU32(): number {
    const bytes = this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  }

  readU64(): bigint {
    const bytes = this.readBytes(8);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, false);
  }

  readString(): string {
    const start = this.offset;
    while (this.offset < this.data.length && this.data[this.offset] !== 0) {
      this.offset += 1;
    }
    if (this.offset >= this.data.length) {
      throw new F4mDataTruncatedError('Unterminated F4M string');
    }
    const out = new TextDecoder().decode(this.data.subarray(start, this.offset));
    this.offset += 1;
    return out;
  }

  readBox(): { size: number; type: string; data: Uint8Array } {
    const size32 = this.readU32();
    const type = new TextDecoder('ascii').decode(this.readBytes(4));
    let size = size32;
    let headerLength = 8;
    if (size32 === 1) {
      const large = this.readU64();
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`F4M box ${type} exceeds safe integer range`);
      }
      size = Number(large);
      headerLength = 16;
    } else if (size32 === 0) {
      size = this.remaining + headerLength;
    }
    if (size < headerLength) throw new Error(`Invalid F4M box size ${size}`);
    return { size, type, data: this.readBytes(size - headerLength) };
  }

  readAsrt(): { segmentRun: F4mSegmentRun[] } {
    this.readU8();
    this.readBytes(3);
    const qualityCount = this.readU8();
    for (let i = 0; i < qualityCount; i++) this.readString();
    const count = this.readU32();
    const segmentRun: F4mSegmentRun[] = [];
    for (let i = 0; i < count; i++) {
      segmentRun.push({
        firstSegment: this.readU32(),
        fragmentsPerSegment: this.readU32(),
      });
    }
    return { segmentRun };
  }

  readAfrt(): { timescale: number; fragments: F4mFragmentRun[] } {
    this.readU8();
    this.readBytes(3);
    const timescale = this.readU32();
    const qualityCount = this.readU8();
    for (let i = 0; i < qualityCount; i++) this.readString();
    const count = this.readU32();
    const fragments: F4mFragmentRun[] = [];
    for (let i = 0; i < count; i++) {
      const first = this.readU32();
      const timestamp = this.readU64();
      const duration = this.readU32();
      fragments.push({
        first,
        timestamp,
        duration,
        discontinuityIndicator: duration === 0 ? this.readU8() : undefined,
      });
    }
    return { timescale, fragments };
  }

  readAbst(): F4mBootstrapInfo {
    this.readU8();
    this.readBytes(3);
    this.readU32();
    const flags = this.readU8();
    const live = (flags & 0x20) !== 0;
    this.readU32();
    this.readU64();
    this.readU64();
    this.readString();
    const serverCount = this.readU8();
    for (let i = 0; i < serverCount; i++) this.readString();
    const qualityCount = this.readU8();
    for (let i = 0; i < qualityCount; i++) this.readString();
    this.readString();
    this.readString();

    const segmentCount = this.readU8();
    const segments: F4mBootstrapInfo['segments'] = [];
    for (let i = 0; i < segmentCount; i++) {
      const box = this.readBox();
      if (box.type !== 'asrt') throw new Error(`Expected asrt, got ${box.type}`);
      segments.push(new FlvReader(box.data).readAsrt());
    }

    const fragmentCount = this.readU8();
    const fragments: F4mBootstrapInfo['fragments'] = [];
    for (let i = 0; i < fragmentCount; i++) {
      const box = this.readBox();
      if (box.type !== 'afrt') throw new Error(`Expected afrt, got ${box.type}`);
      fragments.push(new FlvReader(box.data).readAfrt());
    }
    return { live, segments, fragments };
  }

  readBootstrapInfo(): F4mBootstrapInfo {
    const box = this.readBox();
    if (box.type !== 'abst') throw new Error(`Expected abst, got ${box.type}`);
    return new FlvReader(box.data).readAbst();
  }
}

export function readF4mBootstrapInfo(data: Uint8Array): F4mBootstrapInfo {
  return new FlvReader(data).readBootstrapInfo();
}

export function decodeF4mBootstrapBase64(value: string): F4mBootstrapInfo {
  const compact = value.replace(/\s+/g, '');
  const binary = atob(compact);
  return readF4mBootstrapInfo(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

export function buildF4mFragments(
  bootstrap: F4mBootstrapInfo,
  maxFragments = 100_000,
): F4mFragmentRef[] {
  const segmentRun = bootstrap.segments[0]?.segmentRun;
  const fragmentRun = bootstrap.fragments[0]?.fragments;
  if (!segmentRun?.length || !fragmentRun?.length) return [];
  let fragment = fragmentRun[0]!.first;
  const result: F4mFragmentRef[] = [];
  for (const run of segmentRun) {
    let count = run.fragmentsPerSegment;
    if (count === 0xffffffff && bootstrap.live) count = 2;
    if (count > maxFragments || result.length + count > maxFragments) {
      throw new Error(`F4M bootstrap exceeds ${maxFragments} fragments`);
    }
    for (let i = 0; i < count; i++) {
      result.push({ segment: run.firstSegment, fragment });
      fragment += 1;
    }
  }
  return bootstrap.live ? result.slice(-2) : result;
}

export function buildF4mFragmentUrls(
  baseUrl: string,
  bootstrap: F4mBootstrapInfo,
  query?: string,
): string[] {
  return buildF4mFragments(bootstrap).map(({ segment, fragment }) => {
    const suffix = `Seg${segment}-Frag${fragment}`;
    const parsed = new URL(baseUrl);
    parsed.pathname += suffix;
    const existing = parsed.search.replace(/^\?/, '');
    parsed.search = [existing, query?.replace(/^[?&]/, '')].filter(Boolean).join('&');
    return parsed.toString();
  });
}

export function extractF4mMdat(fragment: Uint8Array): Uint8Array {
  const reader = new FlvReader(fragment);
  while (reader.remaining >= 8) {
    const box = reader.readBox();
    if (box.type === 'mdat') return box.data;
  }
  throw new Error('F4M fragment does not contain mdat');
}

export function makeFlvHeader(metadata?: Uint8Array): Uint8Array {
  const header = Uint8Array.from([
    0x46, 0x4c, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00,
  ]);
  if (!metadata?.length) return header;
  const tag = new Uint8Array(11 + metadata.length + 4);
  tag[0] = 0x12;
  tag[1] = (metadata.length >>> 16) & 0xff;
  tag[2] = (metadata.length >>> 8) & 0xff;
  tag[3] = metadata.length & 0xff;
  tag.set(metadata, 11);
  const previousSize = 11 + metadata.length;
  const view = new DataView(tag.buffer);
  view.setUint32(11 + metadata.length, previousSize, false);
  const out = new Uint8Array(header.length + tag.length);
  out.set(header);
  out.set(tag, header.length);
  return out;
}
