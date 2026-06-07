import { describe, expect, it } from 'vitest';
import {
  computeInlineTextImageSize,
  parseSvgDataUrlIntrinsicSize,
} from '@/lib/media/image/inline-text-image-size';
import {
  buildReaderDisplayBlocks,
  splitRawIntoParagraphSegments,
} from '@/lib/media/text/reader-content-blocks';

describe('inline-text-image-size', () => {
  it('较长边对齐字号，短边按比例', () => {
    const size = computeInlineTextImageSize({ width: 100, height: 90 }, 18, 'TEXT');
    expect(size.width).toBe(18);
    expect(size.height).toBeCloseTo(16.2, 1);
  });

  it('竖图以高度对齐字号', () => {
    const size = computeInlineTextImageSize({ width: 50, height: 100 }, 20, 'TEXT');
    expect(size.height).toBe(20);
    expect(size.width).toBe(10);
  });

  it('从 SVG data URL 解析宽高', () => {
    const svg = '<svg width="100" height="90" viewBox="0 0 25 17"></svg>';
    const b64 = btoa(svg);
    const url = `data:image/svg+xml;base64,${b64}`;
    expect(parseSvgDataUrlIntrinsicSize(url)).toEqual({ width: 100, height: 90 });
  });
});

describe('splitRawIntoParagraphSegments', () => {
  it('按 p 标签分段且不合并多段', () => {
    const raw =
      '<p>第一段<img src="x"></p><p>第二段文字</p><p>第三段</p>';
    const segs = splitRawIntoParagraphSegments(raw);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toContain('第一段');
    expect(segs[1]).toBe('第二段文字');
  });

  it('buildReaderDisplayBlocks 每段独立 paragraph', () => {
    const raw =
      '<p>甲<img src="data:image/svg+xml;base64,abc"></p><p>乙</p>';
    const blocks = buildReaderDisplayBlocks(raw, 'DEFAULT');
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(2);
  });

  it('cleanContent 风格单换行分段（TEXT 模式）', () => {
    const raw =
      '　　第一段文字<img src="data:image/svg+xml;base64,YQ==">' +
      '\n　　第二段文字<img src="data:image/svg+xml;base64,Yg==">';
    const segs = splitRawIntoParagraphSegments(raw);
    expect(segs).toHaveLength(2);
    const blocks = buildReaderDisplayBlocks(raw, 'TEXT');
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(2);
    const para0 = blocks[0];
    expect(para0?.type === 'paragraph' && para0.parts.some((p) => p.kind === 'img')).toBe(true);
  });

  it('保留段首半角与全角缩进空格', () => {
    const raw = '    第一段\n  第二段\n\u3000\u3000第三段';
    const segs = splitRawIntoParagraphSegments(raw);
    expect(segs).toEqual(['    第一段', '  第二段', '\u3000\u3000第三段']);
    const blocks = buildReaderDisplayBlocks(raw, 'DEFAULT');
    const texts = blocks
      .filter((b): b is Extract<typeof b, { type: 'paragraph' }> => b.type === 'paragraph')
      .map((b) => b.parts.filter((p) => p.kind === 'text').map((p) => p.text).join(''));
    expect(texts[0]?.startsWith('    ')).toBe(true);
    expect(texts[1]?.startsWith('  ')).toBe(true);
    expect(texts[2]?.startsWith('\u3000\u3000')).toBe(true);
  });
});
