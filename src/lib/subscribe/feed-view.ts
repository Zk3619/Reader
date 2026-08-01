/**
 * 订阅 FeedView（对齐 Folo FeedViewType 0–5；「全部」仅客户端聚合，不可入库）
 */

export type SubscribeFeedViewKind =
  | 'all'
  | 'articles'
  | 'social-media'
  | 'pictures'
  | 'videos'
  | 'audios'
  | 'notifications';

/** 可写入 sub_sources.view 的取值（不含 all） */
export type SubscribeFeedViewStored = Exclude<SubscribeFeedViewKind, 'all'>;

export const SUBSCRIBE_FEED_VIEW_LABELS: Record<SubscribeFeedViewKind, string> = {
  all: '全部',
  articles: '文章',
  'social-media': '社交媒体',
  pictures: '图片',
  videos: '视频',
  audios: '音频',
  notifications: '通知',
};

export const SUBSCRIBE_FEED_VIEW_TABS: SubscribeFeedViewKind[] = [
  'all',
  'articles',
  'social-media',
  'pictures',
  'videos',
  'audios',
  'notifications',
];

export const SUBSCRIBE_FEED_VIEW_STORED: SubscribeFeedViewStored[] = [
  'articles',
  'social-media',
  'pictures',
  'videos',
  'audios',
  'notifications',
];

const KIND_TO_VIEW: Record<SubscribeFeedViewStored, number> = {
  articles: 0,
  'social-media': 1,
  pictures: 2,
  videos: 3,
  audios: 4,
  notifications: 5,
};

const VIEW_TO_KIND: Record<number, SubscribeFeedViewStored> = {
  0: 'articles',
  1: 'social-media',
  2: 'pictures',
  3: 'videos',
  4: 'audios',
  5: 'notifications',
};

/** 规范化入库 view：非法值回退文章(0) */
export function normalizeSubscribeFeedView(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  return i >= 0 && i <= 5 ? i : 0;
}

export function subscribeFeedViewKindToNumber(
  kind: SubscribeFeedViewKind | undefined | null,
): number | null {
  if (!kind || kind === 'all') return null;
  return KIND_TO_VIEW[kind] ?? 0;
}

export function subscribeFeedViewNumberToKind(view: unknown): SubscribeFeedViewStored {
  return VIEW_TO_KIND[normalizeSubscribeFeedView(view)] ?? 'articles';
}

export function normalizeSubscribeFeedViewKind(value: unknown): SubscribeFeedViewKind {
  if (value === 'all') return 'all';
  if (
    value === 'articles' ||
    value === 'social-media' ||
    value === 'pictures' ||
    value === 'videos' ||
    value === 'audios' ||
    value === 'notifications'
  ) {
    return value;
  }
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    return subscribeFeedViewNumberToKind(value);
  }
  return 'all';
}

/** 侧栏默认写入：非 all 用当前 feedView，否则文章 */
export function defaultSubscribeFeedViewForWrite(
  feedView: SubscribeFeedViewKind | undefined | null,
): number {
  const n = subscribeFeedViewKindToNumber(feedView ?? 'all');
  return n ?? 0;
}

/** RSSHub 发现分类 → view（无可靠映射时默认文章） */
export function rsshubCategoryToFeedView(category: string | undefined | null): number {
  const c = String(category ?? '').trim().toLowerCase();
  if (c === 'picture') return 2;
  if (c === 'multimedia') return 3;
  return 0;
}

export function isSubscribeFeedViewWide(kind: SubscribeFeedViewKind): boolean {
  return kind === 'social-media' || kind === 'pictures' || kind === 'videos';
}

export function isSubscribeFeedViewGrid(kind: SubscribeFeedViewKind): boolean {
  return kind === 'pictures' || kind === 'videos';
}

/** 列表呈现：选中源时跟源的 view；聚合「全部」用文章布局；具体频道跟 feedView */
export function resolveSubscribeListLayoutKind(opts: {
  feedView: SubscribeFeedViewKind;
  sourceView?: number | null;
  hasActiveSource: boolean;
}): SubscribeFeedViewKind {
  if (opts.hasActiveSource) {
    return subscribeFeedViewNumberToKind(opts.sourceView);
  }
  if (opts.feedView === 'all') return 'articles';
  return opts.feedView;
}
