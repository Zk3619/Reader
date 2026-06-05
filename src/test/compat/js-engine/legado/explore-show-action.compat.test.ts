import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  parseExploreShowInfoMapAction,
  runExploreShowActionNative,
} from '@/lib/js-engine/legado/explore-show-action';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';

describe('explore-show-action', () => {
  const ls = new Map<string, string>();
  const source = {
    bookSourceUrl: 'https://book.test/gyks',
    sourceUrl: 'https://book.test/gyks',
  } as BookSource;

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });
  });

  it('parseExploreShowInfoMapAction 识别 createFilter action', () => {
    expect(
      parseExploreShowInfoMapAction("show(infoMap['平台'],'发现页来源')"),
    ).toEqual({ title: '平台', paramKey: '发现页来源' });
  });

  it('runExploreShowActionNative 写入书源变量并触发刷新', async () => {
    const argsKey = getSourceArgsKey(source);
    ls.set(argsKey, JSON.stringify({ 发现页类型: '小说', 频道: '男频' }));
    const refresh = vi.fn();

    runExploreShowActionNative(
      source,
      { title: '类型', paramKey: '发现页类型' },
      { infoMap: { 类型: '听书' }, onRefreshExplore: refresh },
    );

    const saved = JSON.parse(ls.get(argsKey)!) as Record<string, string>;
    expect(saved['发现页类型']).toBe('听书');
    expect(saved['发现页来源']).toBe('番茄');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
