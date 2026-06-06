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
import { layoutPlainTextChapterCanvas } from '@/lib/media/text/canvas-text-chapter-layout';
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
      segments: [],
      cacheKey: 'k1',
    };
    setCachedChapterLayout('k1', layout);
    expect(getCachedChapterLayout('k1')?.engine).toBe('canvas');
    expect(chapterLayoutCacheSize()).toBe(1);
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
