/**
 * 弹幕 protobuf → XML（对照 BiliTools dm.ts，自实现最小 wire 解码）
 */

import { stripControlChars } from './error';

type DanmakuElem = {
  id: string;
  progress: number;
  mode: number;
  fontsize: number;
  color: number;
  midHash: string;
  content: string;
  ctime: string;
  pool: number;
  idStr: string;
};

class WireReader {
  pos = 0;
  constructor(private buf: Uint8Array) {}
  get len() {
    return this.buf.length;
  }
  uint32(): number {
    let result = 0;
    let shift = 0;
    while (shift < 35) {
      const b = this.buf[this.pos++]!;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    throw new Error('varint overflow');
  }
  int32(): number {
    return this.uint32() | 0;
  }
  int64(): string {
    let lo = 0;
    let hi = 0;
    let shift = 0;
    while (true) {
      const b = this.buf[this.pos++]!;
      if (shift < 28) lo |= (b & 0x7f) << shift;
      else hi |= (b & 0x7f) << (shift - 28);
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    // enough for danmaku ids as decimal string
    const big = BigInt(hi >>> 0) * 0x100000000n + BigInt(lo >>> 0);
    return big.toString();
  }
  string(): string {
    const len = this.uint32();
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(slice);
  }
  bytes(): Uint8Array {
    const len = this.uint32();
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }
  skip(wireType: number): void {
    switch (wireType) {
      case 0:
        this.uint32();
        break;
      case 1:
        this.pos += 8;
        break;
      case 2: {
        const len = this.uint32();
        this.pos += len;
        break;
      }
      case 5:
        this.pos += 4;
        break;
      default:
        throw new Error(`unknown wire ${wireType}`);
    }
  }
}

function decodeElem(buf: Uint8Array): DanmakuElem {
  const r = new WireReader(buf);
  const msg: DanmakuElem = {
    id: '0',
    progress: 0,
    mode: 0,
    fontsize: 25,
    color: 16777215,
    midHash: '',
    content: '',
    ctime: '0',
    pool: 0,
    idStr: '',
  };
  while (r.pos < r.len) {
    const tag = r.uint32();
    const field = tag >>> 3;
    const wt = tag & 7;
    switch (field) {
      case 1:
        msg.id = r.int64();
        break;
      case 2:
        msg.progress = r.int32();
        break;
      case 3:
        msg.mode = r.int32();
        break;
      case 4:
        msg.fontsize = r.int32();
        break;
      case 5:
        msg.color = r.int32();
        break;
      case 6:
        msg.midHash = r.string();
        break;
      case 7:
        msg.content = r.string();
        break;
      case 8:
        msg.ctime = r.int64();
        break;
      case 10:
        msg.pool = r.int32();
        break;
      case 12:
        msg.idStr = r.string();
        break;
      default:
        r.skip(wt);
    }
  }
  return msg;
}

export function DanmakuEventToXML(input: Uint8Array, doc: Document): void {
  const r = new WireReader(input);
  const root = doc.documentElement;
  while (r.pos < r.len) {
    const tag = r.uint32();
    const field = tag >>> 3;
    const wt = tag & 7;
    if (field === 1 && wt === 2) {
      const elem = decodeElem(r.bytes());
      const d = doc.createElement('d');
      d.setAttribute(
        'p',
        [
          (elem.progress || 0) / 1000,
          elem.mode,
          elem.fontsize,
          elem.color,
          elem.ctime,
          elem.pool || 0,
          elem.midHash,
          elem.idStr || elem.id,
        ].join(','),
      );
      d.textContent = stripControlChars(elem.content || '');
      root?.appendChild(d);
    } else {
      r.skip(wt);
    }
  }
}
