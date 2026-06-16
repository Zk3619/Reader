import { describe, expect, it, beforeEach } from 'vitest';
import {
  canUseCanvasChapterLayout,
  needsDomChapterLayout,
} from '@/lib/media/text/reader-content-complexity';
import {
  clearChapterLayoutCache,
  getCachedChapterLayout,
  setCachedChapterLayout,
  chapterLayoutCacheSize,
} from '@/lib/media/text/reader-chapter-layout-cache';
import { layoutReaderChapter, isChapterLayoutCompleteForContent } from '@/lib/media/text/reader-chapter-layout';
import { layoutPlainTextChapterCanvas } from '@/lib/media/text/canvas-text-chapter-layout';
import {
  buildChapterLayoutCacheKey,
  buildContentRevision,
  buildReaderLayoutSignature,
  buildViewportSignature,
} from '@/lib/media/text/reader-layout-signature';
import { defaultTextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';

describe('reader-content-complexity', () => {
  it('allows canvas for plain and multi-paragraph p tags', () => {
    expect(canUseCanvasChapterLayout('第一行\n\n第二行')).toBe(true);
    expect(canUseCanvasChapterLayout('<p>甲</p><p>乙</p>')).toBe(true);
  });

  it('requires dom for images and structural html', () => {
    expect(needsDomChapterLayout('<p>x</p><img src="a">')).toBe(true);
    expect(needsDomChapterLayout('<div class="x">y</div>')).toBe(true);
    expect(needsDomChapterLayout('<figure><img></figure>')).toBe(true);
  });
});

describe('reader-chapter-layout-cache', () => {
  beforeEach(() => clearChapterLayoutCache());

  it('stores and retrieves by cache key', () => {
    const layout: ReaderChapterLayout = {
      chapterIndex: 0,
      engine: 'canvas',
      pages: [{ index: 0, startY: 0, endY: 100, displayHeight: 100, chapterPosition: 0 }],
      pageStarts: [0],
      clipHeight: 500,
      viewportHeight: 600,
      viewportWidth: 400,
      contentExtent: 100,
      padTop: 24,
      padBottom: 8,
      segments: [{ top: 0, bottom: 100 }],
      cacheKey: 'k1',
    };
    setCachedChapterLayout('k1', layout);
    expect(getCachedChapterLayout('k1')?.engine).toBe('canvas');
    expect(chapterLayoutCacheSize()).toBe(1);
  });
});

describe('layoutReaderChapter incomplete cache', () => {
  beforeEach(() => clearChapterLayoutCache());

  it('does not persist or reuse layout with empty segments when content exists', () => {
    const layout = layoutReaderChapter({
      chapterIndex: 0,
      content: '有正文的章节',
      viewportWidth: 400,
      viewportHeight: 600,
      config: defaultTextViewerUiConfig,
      contentRoot: null,
      dualPage: true,
      clipHeightPx: 500,
    });

    expect(layout.segments).toEqual([]);
    expect(getCachedChapterLayout(layout.cacheKey)).toBeUndefined();

    setCachedChapterLayout(layout.cacheKey, layout);
    const again = layoutReaderChapter({
      chapterIndex: 0,
      content: '有正文的章节',
      viewportWidth: 400,
      viewportHeight: 600,
      config: defaultTextViewerUiConfig,
      contentRoot: null,
      dualPage: true,
      clipHeightPx: 500,
    });
    expect(again.segments).toEqual([]);
    expect(again.cacheKey).toBe(layout.cacheKey);
  });

  it('cache hit preserves dualPage flag from input', () => {
    const config = defaultTextViewerUiConfig;
    const content = '有正文的章节';
    const cacheKey = buildChapterLayoutCacheKey({
      chapterIndex: 0,
      contentRevision: buildContentRevision(content),
      layoutSignature: buildReaderLayoutSignature(config, {
        dualPage: true,
        viewportWidth: 400,
        viewportHeight: 600,
      }),
      viewportSignature: buildViewportSignature(400, 600),
    });
    const cached: ReaderChapterLayout = {
      chapterIndex: 0,
      engine: 'dom',
      pages: [{ index: 0, startY: 0, endY: 100, displayHeight: 100, chapterPosition: 0 }],
      pageStarts: [0],
      rightPageStarts: [0],
      clipHeight: 500,
      viewportHeight: 600,
      viewportWidth: 400,
      contentExtent: 100,
      padTop: 24,
      padBottom: 8,
      segments: [{ top: 0, bottom: 100, column: 0 }],
      cacheKey,
    };
    setCachedChapterLayout(cacheKey, cached);

    const hit = layoutReaderChapter({
      chapterIndex: 0,
      content,
      viewportWidth: 400,
      viewportHeight: 600,
      config,
      contentRoot: null,
      dualPage: true,
      clipHeightPx: 500,
    });

    expect(hit.dualPage).toBe(true);
    expect(hit.segments.length).toBeGreaterThan(0);
  });
});

describe('isChapterLayoutCompleteForContent', () => {
  const baseLayout: ReaderChapterLayout = {
    chapterIndex: 1,
    engine: 'canvas',
    pages: [{ index: 0, startY: 0, endY: 100, displayHeight: 100, chapterPosition: 0 }],
    pageStarts: [0],
    clipHeight: 500,
    viewportHeight: 600,
    viewportWidth: 400,
    contentExtent: 100,
    padTop: 24,
    padBottom: 8,
    segments: [{ top: 0, bottom: 100 }],
    cacheKey: 'k',
  };

  it('rejects canvas layout when content requires dom', () => {
    expect(
      isChapterLayoutCompleteForContent(
        baseLayout,
        1,
        '<p>x</p><img src="a">',
      ),
    ).toBe(false);
  });

  it('accepts dom engine for complex html', () => {
    expect(
      isChapterLayoutCompleteForContent(
        { ...baseLayout, engine: 'dom' },
        1,
        '<p>x</p><img src="a">',
      ),
    ).toBe(true);
  });

  it('rejects provisional canvas placeholder', () => {
    expect(
      isChapterLayoutCompleteForContent(
        { ...baseLayout, isLayoutComplete: false },
        1,
        '纯文本',
      ),
    ).toBe(false);
  });
});

describe('layoutPlainTextChapterCanvas', () => {
  it('returns canvas chapter layout with at least one page', () => {
    const layout = layoutPlainTextChapterCanvas({
      chapterIndex: 0,
      raw: '第一章\n\n' + '正文内容。'.repeat(200),
      viewportWidth: 360,
      viewportHeight: 640,
      config: { ...defaultTextViewerUiConfig, fontSize: 18 },
      cacheKey: 'test',
    });
    expect(layout.engine).toBe('canvas');
    expect(layout.pageStarts[0]).toBe(0);
    expect(layout.pages.length).toBe(layout.pageStarts.length);
    expect(layout.pages[0]!.displayHeight).toBeGreaterThan(0);
  });
});
