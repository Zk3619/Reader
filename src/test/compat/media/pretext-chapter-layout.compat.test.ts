import { describe, expect, it, vi } from 'vitest';
import { setPretextImageIntrinsic } from '@/lib/media/image/pretext-image-intrinsic';
import { layoutDocumentFromChapter } from '@/lib/media/text/pretext-layout-document';
import { computeSegmentsFromLayoutDocument } from '@/lib/media/text/pretext-chapter-segments';
import { layoutChapterFromPretext } from '@/lib/media/text/pretext-chapter-layout';
import { diffPretextDomPageStarts } from '@/lib/media/text/pretext-dom-diff';
import { canUsePretextChapterLayout } from '@/lib/media/text/reader-content-complexity';
import { buildChapterImageRevision } from '@/lib/media/text/reader-layout-signature';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { buildPagedBookmarkSnapshot } from '@/lib/media/text/reader-paged-bookmark-text';

const baseConfig = {
  ...defaultTextViewerUiConfig,
  layoutEngine: 'pretext' as const,
};

describe('pretext-layout-document', () => {
  it('parses plain paragraphs', () => {
    const doc = layoutDocumentFromChapter({
      raw: '第一行\n\n第二行',
      config: baseConfig,
      viewportWidth: 400,
      viewportHeight: 700,
      horizontalInsetOnSlot: true,
    });
    expect(doc.unsupported).toBe(false);
    expect(doc.blocks.length).toBeGreaterThan(0);
    expect(doc.imageIds).toEqual([]);
  });

  it('marks structural html unsupported', () => {
    const doc = layoutDocumentFromChapter({
      raw: '<div><p>x</p></div>',
      config: baseConfig,
      viewportWidth: 400,
      viewportHeight: 700,
    });
    expect(doc.unsupported).toBe(true);
  });

  it('parses figure blocks from img tags', () => {
    const doc = layoutDocumentFromChapter({
      raw: '段落\n\n<img src="https://example.com/a.jpg">',
      config: baseConfig,
      viewportWidth: 400,
      viewportHeight: 700,
    });
    expect(doc.unsupported).toBe(false);
    expect(doc.blocks.some((b) => b.kind === 'figure')).toBe(true);
    expect(doc.imageIds.length).toBeGreaterThan(0);
  });

  it('uses intrinsic map for figure height', () => {
    const url = 'https://example.com/wide.jpg';
    const intrinsic = new Map([['https://example.com/wide.jpg', { width: 800, height: 400 }]]);
    const doc = layoutDocumentFromChapter({
      raw: `<img src="${url}">`,
      config: baseConfig,
      viewportWidth: 400,
      viewportHeight: 700,
      intrinsicByUrl: intrinsic,
    });
    const figure = doc.blocks.find((b) => b.kind === 'figure');
    expect(figure?.kind).toBe('figure');
    if (figure?.kind === 'figure') {
      expect(figure.height).toBeGreaterThan(100);
      expect(doc.imageIds).not.toContain(url);
    }
  });
});

describe('buildChapterImageRevision', () => {
  it('changes when intrinsic becomes available', () => {
    const urls = ['https://example.com/a.jpg'];
    const pending = buildChapterImageRevision(urls, new Map());
    const resolved = buildChapterImageRevision(
      urls,
      new Map([['https://example.com/a.jpg', { width: 320, height: 240 }]]),
    );
    expect(pending).not.toBe(resolved);
    expect(pending).toContain('@pending');
    expect(resolved).toContain('320x240');
  });
});

describe('pretext-chapter-layout', () => {
  it('layouts plain chapter without DOM', () => {
    const layout = layoutChapterFromPretext({
      chapterIndex: 0,
      raw: '甲\n\n乙\n\n丙',
      viewportWidth: 400,
      viewportHeight: 700,
      config: baseConfig,
      cacheKey: 't1',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
    });
    expect(layout).not.toBeNull();
    expect(layout!.engine).toBe('pretext');
    expect(layout!.pageStarts.length).toBeGreaterThan(0);
    expect(layout!.segments.length).toBeGreaterThan(0);
  });

  it('compute segments yields positive extent', () => {
    const doc = layoutDocumentFromChapter({
      raw: '测试段落内容',
      config: baseConfig,
      viewportWidth: 400,
      viewportHeight: 700,
      horizontalInsetOnSlot: true,
    });
    const { segments, contentExtent, lineMetas } = computeSegmentsFromLayoutDocument(doc, baseConfig);
    expect(segments.length).toBeGreaterThan(0);
    expect(contentExtent).toBeGreaterThan(0);
    expect(lineMetas.length).toBe(segments.length);
    expect(lineMetas[0]?.chapterPosition).toBe(0);
  });

  it('pageStarts change when figure intrinsic height changes', () => {
    const url = 'https://example.com/tall.jpg';
    const raw = `${'长段落文字。'.repeat(40)}\n\n<img src="${url}">`;
    const placeholder = layoutChapterFromPretext({
      chapterIndex: 0,
      raw,
      viewportWidth: 400,
      viewportHeight: 700,
      config: baseConfig,
      cacheKey: 'placeholder',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
    });
    const intrinsic = new Map([[url, { width: 200, height: 2400 }]]);
    const refined = layoutChapterFromPretext({
      chapterIndex: 0,
      raw,
      viewportWidth: 400,
      viewportHeight: 700,
      config: baseConfig,
      cacheKey: 'refined',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
      intrinsicByUrl: intrinsic,
    });
    expect(placeholder).not.toBeNull();
    expect(refined).not.toBeNull();
    const placeholderFigure = placeholder!.segments.find((s) => s.bottom - s.top > 150);
    const refinedFigure = refined!.segments.find((s) => s.bottom - s.top > 150);
    expect(refinedFigure).toBeDefined();
    expect((refinedFigure?.bottom ?? 0) - (refinedFigure?.top ?? 0))
      .toBeGreaterThan((placeholderFigure?.bottom ?? 0) - (placeholderFigure?.top ?? 0));
  });

  it('assigns chapterPosition to pages from line map', () => {
    const layout = layoutChapterFromPretext({
      chapterIndex: 0,
      raw: '第一章\n\n第二章',
      viewportWidth: 400,
      viewportHeight: 700,
      config: baseConfig,
      cacheKey: 'pos',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
    });
    expect(layout?.pages[0]?.chapterPosition).toBe(0);
    expect(layout?.pages[0]?.text?.length).toBeGreaterThan(0);
  });

  it('float figure reduces text line width in wrap band', () => {
    const fullConfig = { ...baseConfig, imageStyle: 'FULL' as const };
    const raw = `${'绕排测试文字。'.repeat(30)}\n\n<img src="https://example.com/small.jpg">`;
    const intrinsic = new Map([['https://example.com/small.jpg', { width: 120, height: 80 }]]);
    const doc = layoutDocumentFromChapter({
      raw,
      config: fullConfig,
      viewportWidth: 400,
      viewportHeight: 700,
      intrinsicByUrl: intrinsic,
    });
    const figure = doc.blocks.find((b) => b.kind === 'figure');
    expect(figure?.kind).toBe('figure');
    if (figure?.kind === 'figure') {
      expect(figure.float).toBe('right');
    }
    const { lineMetas } = computeSegmentsFromLayoutDocument(doc, fullConfig);
    const positions = lineMetas.map((l) => l.chapterPosition);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!);
    }
  });
});

describe('pretext-dom-diff', () => {
  it('diffs page starts', () => {
    const r = diffPretextDomPageStarts([0, 400, 800], [0, 410, 800]);
    expect(r.pageCountMatch).toBe(true);
    expect(r.maxStartDeltaPx).toBe(10);
  });
});

describe('canUsePretextChapterLayout', () => {
  it('allows img chapters', () => {
    expect(canUsePretextChapterLayout('<p>x</p><img src="a">')).toBe(true);
  });

  it('rejects table structural html', () => {
    expect(canUsePretextChapterLayout('<table><tr><td>x</td></tr></table>')).toBe(false);
  });
});

describe('pretext bookmark snapshot', () => {
  it('prefers layout page text on pretext engine', () => {
    const layout = layoutChapterFromPretext({
      chapterIndex: 0,
      raw: '书签测试正文',
      viewportWidth: 400,
      viewportHeight: 700,
      config: baseConfig,
      cacheKey: 'bm',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
    });
    expect(layout?.pages[0]?.text?.length).toBeGreaterThan(0);
    const snap = buildPagedBookmarkSnapshot({
      layout: layout ?? undefined,
      pageIndex: 0,
    });
    expect(snap.pageText.length).toBeGreaterThan(0);
  });
});

describe('pretext-image-intrinsic', () => {
  it('caches decoded dimensions', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 120;
        naturalHeight = 80;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
        decode() {
          return Promise.resolve();
        }
      },
    );
    setPretextImageIntrinsic('https://example.com/cached.png', { width: 120, height: 80 });
    const revision = buildChapterImageRevision(
      ['https://example.com/cached.png'],
      new Map([['https://example.com/cached.png', { width: 120, height: 80 }]]),
    );
    expect(revision).toContain('120x80');
    vi.unstubAllGlobals();
  });
});
