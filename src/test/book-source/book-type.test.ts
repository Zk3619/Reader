import { describe, expect, it } from 'vitest';
import {
  BookType,
  BookSourceType,
  resolveBookType,
  resolveMediaKind,
  resolveMediaKindWithSource,
} from '@/lib/book-source/book-type';

describe('resolveBookType', () => {
  it('保留 Legado 图片位标志，不因 tab 小说 降为文本', () => {
    expect(resolveBookType(BookType.image, '小说')).toBe(BookType.image);
  });

  it('书源枚举 2 仍解析为图片类型', () => {
    expect(resolveBookType(2, '小说')).toBe(BookType.image);
  });

  it('tab 漫画 覆盖纯文本 type', () => {
    expect(resolveBookType(BookType.text, '漫画')).toBe(BookType.image);
  });
});

describe('resolveMediaKind', () => {
  it('type 为图片位时忽略 data URL 内 tab=小说', () => {
    const payload = { tab: '小说' };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const kind = resolveMediaKind({
      type: BookType.image,
      origin: 'https://example.com',
      bookUrl: `data:application/json;base64,${b64}`,
      tocUrl: '',
    });
    expect(kind).toBe('image');
  });
});

describe('resolveMediaKindWithSource', () => {
  it('type=8 且书源 sourceType=2 时进入 image', () => {
    expect(
      resolveMediaKindWithSource(
        {
          type: BookType.text,
          origin: 'https://www.tuku.cc',
          bookUrl: 'https://www.tuku.cc/manga-1/',
          tocUrl: 'https://www.tuku.cc/manga-1/',
          tab: '小说',
        },
        BookSourceType.image,
      ),
    ).toBe('image');
  });
});
