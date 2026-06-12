import { describe, expect, it } from 'vitest';

import {

  mergeLocalTxtFileMeta,

  readLocalTxtFileMeta,

} from '@/lib/local-book/local-txt-file-meta';

import {

  alignBlockEndToNewline,

  detectUtf8BomSkip,

  utf8CharIndexToByteOffset,

} from '@/lib/local-book/txt-stream-parser';



describe('local-txt-file-meta', () => {

  it('merges txtByteSize into book.variable JSON', () => {

    const merged = mergeLocalTxtFileMeta('{"source":"x"}', { txtByteSize: 12345 });

    expect(readLocalTxtFileMeta(merged)).toEqual({ txtByteSize: 12345 });

    const obj = JSON.parse(merged);

    expect(obj.source).toBe('x');

  });



  it('merges mtime and offset unit', () => {

    const merged = mergeLocalTxtFileMeta('', {

      txtByteSize: 100,

      txtFileMtime: 1700000000000,

      txtOffsetUnit: 'byte',

    });

    expect(readLocalTxtFileMeta(merged)).toEqual({

      txtByteSize: 100,

      txtFileMtime: 1700000000000,

      txtOffsetUnit: 'byte',

    });

  });

});



describe('txt-stream-parser', () => {

  it('detects UTF-8 BOM skip', () => {

    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);

    expect(detectUtf8BomSkip(bytes)).toBe(3);

    expect(detectUtf8BomSkip(new Uint8Array([0x41]))).toBe(0);

  });



  it('aligns block end to last newline when not at EOF', () => {

    const bytes = new Uint8Array([0x41, 0x0a, 0x42, 0x43, 0x44]);

    expect(alignBlockEndToNewline(bytes, 0, 4)).toBe(2);

  });



  it('maps UTF-8 char index to byte offset', () => {

    const text = '中A';

    expect(utf8CharIndexToByteOffset(text, 0)).toBe(0);

    expect(utf8CharIndexToByteOffset(text, 1)).toBe(3);

    expect(utf8CharIndexToByteOffset(text, 2)).toBe(4);

  });

});

