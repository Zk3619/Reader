import { describe, expect, it } from 'vitest';

import { listFetchableMangaImageRefs } from '@/lib/export/export-images';

describe('export-manga-images helpers', () => {
  it('lists blob-fetchable manga refs and skips data urls', () => {
    const html =
      '<img src="https://cdn.example.com/a.jpg">' +
      '<img src="data:image/png;base64,abc">';
    const refs = listFetchableMangaImageRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.url).toContain('cdn.example.com');
  });
});
