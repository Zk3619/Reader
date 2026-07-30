/**
 * 订阅模块备份文件名契约回归：legacy RSS 文件名不变，sub* 独立存在
 */

import { describe, expect, it } from 'vitest';
import { BACKUP_SELECTOR_ITEMS } from '@/lib/backup/backup-selector-config';

describe('subscribe backup selector contracts', () => {
  it('keeps legacy rss filenames and adds isolated sub* files', () => {
    const byKey = Object.fromEntries(BACKUP_SELECTOR_ITEMS.map((item) => [item.key, item]));
    expect(byKey.rssSources?.fileName).toBe('rssSources.json');
    expect(byKey.rssStar?.fileName).toBe('rssStar.json');
    expect(byKey.subSources?.fileName).toBe('subSources.json');
    expect(byKey.subFeeds?.fileName).toBe('subFeeds.json');
    expect(byKey.subEntries?.fileName).toBe('subEntries.json');
  });

  it('does not collide sub* keys with legacy rss keys', () => {
    const keys = BACKUP_SELECTOR_ITEMS.map((item) => item.key);
    const files = BACKUP_SELECTOR_ITEMS.map((item) => item.fileName);
    expect(keys).toContain('subSources');
    expect(keys).toContain('rssSources');
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(files).size).toBe(files.length);
    expect(files.filter((f) => f.startsWith('sub'))).toEqual([
      'subSources.json',
      'subFeeds.json',
      'subEntries.json',
    ]);
  });
});
