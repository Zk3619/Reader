import { describe, expect, it } from 'vitest';
import { DEFAULT_CACHE_EXPORT_OPTIONS } from '@/lib/export/cache-export-types';

describe('cache export defaults', () => {
  it('defaults image export to chapter grouping', () => {
    expect(DEFAULT_CACHE_EXPORT_OPTIONS.imageGroupByChapter).toBe(true);
  });

  it('defaults text export to single txt file', () => {
    expect(DEFAULT_CACHE_EXPORT_OPTIONS.textFormat).toBe('txt');
    expect(DEFAULT_CACHE_EXPORT_OPTIONS.textLayout).toBe('single');
  });
});
