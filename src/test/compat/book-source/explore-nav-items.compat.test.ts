import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import {
  augmentExploreServerSelectSections,
  getExploreSectionSelectDisplayValue,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';
import {
  buildExploreSectionNavItems,
  getExploreArgumentSelectValue,
  resolveDefaultExploreNavSelection,
} from '@/lib/book-source/explore-nav-items';

describe('explore nav select value sync', () => {
  const source = {
    bookSourceUrl: 'https://example.com',
    sourceUrl: 'https://example.com',
    sourceName: '示例',
  } as BookSource;

  const ls = new Map<string, string>();

  afterEach(() => {
    vi.unstubAllGlobals();
    ls.clear();
  });

  it('getExploreArgumentSelectValue matches drawer display after localStorage update', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const sections = [
      {
        title: '模式',
        type: 'select',
        chars: ['小说', '听书'],
        default: '小说',
        paramKey: 'find_tab',
      },
    ];

    updateExploreSourceArgument(source, 'find_tab', '听书');

    const items = buildExploreSectionNavItems(sections);
    expect(items[0]?.kind).toBe('select');
    if (items[0]?.kind !== 'select') return;

    expect(getExploreArgumentSelectValue(items[0], null, source)).toBe('听书');
    expect(getExploreSectionSelectDisplayValue(source, sections[0])).toBe('听书');
    expect(ls.has(getSourceArgsKey(source))).toBe(true);
  });

  it('线路 select 同步 server 字段并展示当前线路', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const ip = 'http://101.35.133.34:8888';
    const section = {
      title: '线路',
      type: 'select',
      chars: ['https://v1.gyks.cf', 'https://v2.gyks.cf'],
      default: 'https://v1.gyks.cf',
      paramKey: '线路',
      action: "show(infoMap['线路'],'线路')",
    };

    updateExploreSourceArgument(source, '线路', ip);

    const saved = JSON.parse(ls.get(getSourceArgsKey(source)) ?? '{}') as Record<string, string>;
    expect(saved['线路']).toBe(ip);
    expect(saved['server']).toBe(ip);
    expect(getExploreSectionSelectDisplayValue(source, section)).toBe(ip);

    const augmented = augmentExploreServerSelectSections(source, [section])[0]!;
    expect(augmented.chars).toContain(ip);
    expect(getExploreSourceArgsVersion(source.bookSourceUrl)).toBeGreaterThan(0);
  });

  it('IP 在 hosts 末位时不应被探索页默认选中逻辑写回 v1', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const ip = 'http://101.35.133.34:8888';
    const gyksSource = {
      bookSourceUrl: '光遇聚合',
      sourceUrl: '光遇聚合',
      sourceName: '光遇',
    } as BookSource;

    ls.set(
      getSourceArgsKey(gyksSource),
      JSON.stringify({ 线路: ip, server: ip }),
    );

    const section = {
      title: '线路',
      type: 'select',
      chars: ['https://v1.gyks.cf', 'https://v2.gyks.cf', ip],
      default: 'https://v1.gyks.cf',
      paramKey: '线路',
      action: "show(infoMap['线路'],'线路')",
    };

    const items = buildExploreSectionNavItems([section]);
    expect(items[0]?.kind).toBe('select');
    if (items[0]?.kind !== 'select') return;

    expect(getExploreArgumentSelectValue(items[0], null, gyksSource)).toBe(ip);

    const { argumentUpdate } = resolveDefaultExploreNavSelection(
      [section],
      null,
      gyksSource,
    );
    expect(argumentUpdate).toBeUndefined();
    expect(ls.get(getSourceArgsKey(gyksSource))).toContain(ip);
  });
});
