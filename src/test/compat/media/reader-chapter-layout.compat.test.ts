import { describe, expect, it, beforeEach } from 'vitest';
import {
  canUseCanvasChapterLayout,
  canUsePretextChapterLayout,
  needsDomChapterLayout,
} from '@/lib/media/text/reader-content-complexity';
import {
  clearChapterLayoutCache,
  getCachedChapterLayout,
  setCachedChapterLayout,
  chapterLayoutCacheSize,
} from '@/lib/media/text/reader-chapter-layout-cache';
import { layoutReaderChapter, isChapterLayoutCompleteForContent, layoutPrefersDomForTipChrome } from '@/lib/media/text/reader-chapter-layout';
import { layoutChapterFromPretext } from '@/lib/media/text/pretext-chapter-layout';
import {
  buildChapterLayoutCacheKey,
  buildContentRevision,
  buildReaderLayoutSignature,
  buildViewportSignature,
  resolveLayoutPageWindowMetrics,
} from '@/lib/media/text/reader-layout-signature';
import { defaultTextViewerUiConfig, textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
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

  it('pretext can layout img chapters when not structural', () => {
    expect(canUsePretextChapterLayout('<p>x</p><img src="a">')).toBe(true);
    expect(canUsePretextChapterLayout('<div class="x">y</div>')).toBe(false);
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
    const pageWindow = resolveLayoutPageWindowMetrics(600, {
      clipHeightPx: 500,
      defaultPads: textViewerPagedContentInsets(config),
    });
    const cacheKey = buildChapterLayoutCacheKey({
      chapterIndex: 0,
      contentRevision: buildContentRevision(content),
      layoutSignature: buildReaderLayoutSignature(config, {
        dualPage: true,
        viewportWidth: 400,
        viewportHeight: 600,
      }),
      viewportSignature: buildViewportSignature(400, 600, pageWindow),
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

  it('does not reuse cache when tip chrome shrinks clip height', () => {
    const config = { ...defaultTextViewerUiConfig, layoutEngine: 'pretext' as const };
    const content = '章节\n\n' + '正文行。\n'.repeat(80);

    const full = layoutReaderChapter({
      chapterIndex: 0,
      content,
      viewportWidth: 400,
      viewportHeight: 800,
      config,
      contentRoot: null,
      clipHeightPx: 740,
      padTop: 0,
      padBottom: 0,
    });
    const cramped = layoutReaderChapter({
      chapterIndex: 0,
      content,
      viewportWidth: 400,
      viewportHeight: 800,
      config,
      contentRoot: null,
      clipHeightPx: 600,
      padTop: 30,
      padBottom: 40,
    });

    expect(full.clipHeight).toBe(740);
    expect(cramped.clipHeight).toBe(600);
    expect(cramped.pageStarts.length).toBeGreaterThanOrEqual(full.pageStarts.length);
    expect(cramped.cacheKey).not.toBe(full.cacheKey);
  });
});

describe('layoutPrefersDomForTipChrome', () => {
  it('returns true when measure root exists and tip pads are non-zero', () => {
    expect(
      layoutPrefersDomForTipChrome({
        chapterIndex: 0,
        content: 'test',
        viewportWidth: 400,
        viewportHeight: 800,
        config: defaultTextViewerUiConfig,
        contentRoot: {} as HTMLElement,
        padTop: 28,
        padBottom: 36,
        clipHeightPx: 520,
      }),
    ).toBe(true);
  });

  it('returns false without measure root even when tip pads are set', () => {
    expect(
      layoutPrefersDomForTipChrome({
        chapterIndex: 0,
        content: 'test',
        viewportWidth: 400,
        viewportHeight: 800,
        config: defaultTextViewerUiConfig,
        contentRoot: null,
        padTop: 28,
        padBottom: 36,
        clipHeightPx: 520,
      }),
    ).toBe(false);
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

describe('layoutChapterFromPretext', () => {
  it('returns pretext chapter layout with at least one page', () => {
    const layout = layoutChapterFromPretext({
      chapterIndex: 0,
      raw: '第一章\n\n' + '正文内容。'.repeat(200),
      viewportWidth: 360,
      viewportHeight: 640,
      config: { ...defaultTextViewerUiConfig, fontSize: 18, layoutEngine: 'pretext' },
      cacheKey: 'test',
      clipHeightPx: 500,
      horizontalInsetOnSlot: true,
    });
    expect(layout).not.toBeNull();
    expect(layout!.engine).toBe('pretext');
    expect(layout!.pageStarts[0]).toBe(0);
    expect(layout!.pages.length).toBe(layout!.pageStarts.length);
    expect(layout!.pages[0]!.displayHeight).toBeGreaterThan(0);
  });
});
