import { describe, expect, it } from 'vitest';
import {
  defaultSubscribeFeedViewForWrite,
  normalizeSubscribeFeedView,
  normalizeSubscribeFeedViewKind,
  resolveSubscribeListLayoutKind,
  rsshubCategoryToFeedView,
  subscribeFeedViewKindToNumber,
  subscribeFeedViewNumberToKind,
} from '@/lib/subscribe/feed-view';

describe('feed-view helpers', () => {
  it('normalizes stored view 0–5', () => {
    expect(normalizeSubscribeFeedView(1)).toBe(1);
    expect(normalizeSubscribeFeedView(9)).toBe(0);
    expect(normalizeSubscribeFeedView('3')).toBe(3);
    expect(normalizeSubscribeFeedView(undefined)).toBe(0);
  });

  it('maps kind ↔ number; all is not storable', () => {
    expect(subscribeFeedViewKindToNumber('all')).toBeNull();
    expect(subscribeFeedViewKindToNumber('videos')).toBe(3);
    expect(subscribeFeedViewNumberToKind(2)).toBe('pictures');
    expect(normalizeSubscribeFeedViewKind('social-media')).toBe('social-media');
    expect(normalizeSubscribeFeedViewKind(4)).toBe('audios');
  });

  it('defaults write view from sidebar feedView', () => {
    expect(defaultSubscribeFeedViewForWrite('all')).toBe(0);
    expect(defaultSubscribeFeedViewForWrite('pictures')).toBe(2);
  });

  it('maps RSSHub taxonomy heuristically without treating it as FeedView', () => {
    expect(rsshubCategoryToFeedView('picture')).toBe(2);
    expect(rsshubCategoryToFeedView('multimedia')).toBe(3);
    expect(rsshubCategoryToFeedView('blog')).toBe(0);
    expect(rsshubCategoryToFeedView('social-media')).toBe(0);
  });

  it('resolves list layout from feedView or active source', () => {
    expect(
      resolveSubscribeListLayoutKind({
        feedView: 'videos',
        hasActiveSource: false,
      }),
    ).toBe('videos');
    // 「全部」+ 选中源：跟源自身 view
    expect(
      resolveSubscribeListLayoutKind({
        feedView: 'all',
        hasActiveSource: true,
        sourceView: 1,
      }),
    ).toBe('social-media');
    expect(
      resolveSubscribeListLayoutKind({
        feedView: 'all',
        hasActiveSource: true,
        sourceView: 2,
      }),
    ).toBe('pictures');
    // 「全部」聚合首页：文章布局
    expect(
      resolveSubscribeListLayoutKind({
        feedView: 'all',
        hasActiveSource: false,
      }),
    ).toBe('articles');
  });
});
