import { describe, expect, it } from 'vitest';
import { isInlineCoverImageUrl } from '@/lib/http/cover-image-loader';
import {
  loadRssArticleCoverBlob,
  resolveRssArticleCoverDisplayUrl,
} from '@/lib/rss-source/rss-cover-image';
import type { RssSource } from '@/types';

const svgDataUrl =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNjAiIGhlaWdodD0iMzYwIi8+';

const source = {
  sourceUrl: 'https://aifun.ltd',
  sourceName: 'AI风月',
  sourceIcon: svgDataUrl,
} as RssSource;

describe('rss-cover-image', () => {
  it('识别内联 data:/blob: 封面', () => {
    expect(isInlineCoverImageUrl(svgDataUrl)).toBe(true);
    expect(isInlineCoverImageUrl('blob:https://localhost/abc')).toBe(true);
    expect(isInlineCoverImageUrl('https://cdn.example/a.jpg')).toBe(false);
    expect(isInlineCoverImageUrl('data:text/plain,x')).toBe(false);
  });

  it('data:image 封面直接返回，不经 HTTP 拉取', async () => {
    const out = await loadRssArticleCoverBlob(source, svgDataUrl);
    expect(out).toBe(svgDataUrl);
  });

  it('resolveRssArticleCoverDisplayUrl 识别内联图', () => {
    expect(resolveRssArticleCoverDisplayUrl(source, svgDataUrl)).toBe(svgDataUrl);
  });
});
