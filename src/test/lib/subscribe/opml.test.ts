/**
 * OPML 解析/导出单测
 */

import { describe, expect, it } from 'vitest';
import { buildOpml, parseOpml, subscribeOpmlExportSlug } from '@/lib/subscribe/opml';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Demo</title></head>
  <body>
    <outline text="News">
      <outline type="rss" text="Example" xmlUrl="https://example.com/rss.xml" htmlUrl="https://example.com" />
      <outline type="rss" text="Dup" xmlUrl="https://example.com/rss.xml" />
    </outline>
    <outline type="rss" text="Ungrouped" xmlUrl="https://feeds.example.org/atom.xml" />
  </body>
</opml>`;

describe('subscribe opml', () => {
  it('parses nested folders and dedupes urls', () => {
    const items = parseOpml(SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Example',
      xmlUrl: 'https://example.com/rss.xml',
      category: 'News',
    });
    expect(items[1]).toMatchObject({
      title: 'Ungrouped',
      xmlUrl: 'https://feeds.example.org/atom.xml',
      category: '',
    });
  });

  it('round-trips export then parse', () => {
    const xml = buildOpml([
      { title: 'A', url: 'https://a.test/feed', category: 'Tech' },
      { title: 'B', url: 'https://b.test/feed', category: '' },
    ]);
    const items = parseOpml(xml);
    expect(items).toEqual([
      { title: 'A', xmlUrl: 'https://a.test/feed', category: 'Tech' },
      { title: 'B', xmlUrl: 'https://b.test/feed', category: '' },
    ]);
  });

  it('accepts custom head title', () => {
    const xml = buildOpml(
      [{ title: 'A', url: 'https://a.test/feed', category: 'Tech' }],
      { title: 'Reader · Tech' },
    );
    expect(xml).toContain('<title>Reader · Tech</title>');
  });

  it('builds slug for export filenames', () => {
    expect(subscribeOpmlExportSlug()).toBe('all');
    expect(subscribeOpmlExportSlug('')).toBe('uncategorized');
    expect(subscribeOpmlExportSlug('虎嗅')).toBe('虎嗅');
  });

  it('returns empty for documents without feed outlines', () => {
    expect(parseOpml('<opml version="2.0"><body></body></opml>')).toEqual([]);
  });

  it('rejects malformed xml', () => {
    expect(() => parseOpml('<opml><body><outline')).toThrow(/OPML/);
  });
});
