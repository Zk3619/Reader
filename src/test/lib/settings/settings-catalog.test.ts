import { describe, expect, it } from 'vitest';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_ITEMS,
  searchSettingsItems,
} from '@/lib/settings/settings-catalog';

describe('settings-catalog', () => {
  it('includes the main-program categories and keeps every item addressable', () => {
    const categoryIds = new Set(SETTINGS_CATEGORIES.map((category) => category.id));
    expect(categoryIds).toEqual(
      new Set(['general', 'appearance', 'window-system', 'network', 'storage', 'about']),
    );
    expect(SETTINGS_ITEMS.every((item) => categoryIds.has(item.categoryId))).toBe(true);
    expect(new Set(SETTINGS_ITEMS.map((item) => item.id)).size).toBe(SETTINGS_ITEMS.length);
  });

  it('finds newly exposed settings by user-facing keywords', () => {
    expect(searchSettingsItems('语言').map((item) => item.id)).toContain('general-preferences');
    expect(searchSettingsItems('托盘').map((item) => item.id)).toContain('desktop-integration');
    expect(searchSettingsItems('timeout').map((item) => item.id)).toContain('network-defaults');
    expect(searchSettingsItems('版本').map((item) => item.id)).toContain('about-reader');
  });
});
