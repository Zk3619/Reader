/**
 * 订阅首页导航：FeedView + Timeline 常量
 */

import type { Component } from 'solid-js';
import {
  BookmarkIcon,
  RecordIcon,
  RssIcon,
  StarIcon,
} from '@/components/shared/icons';
import type { SubscribeTimelineKind } from '@/lib/persistence/domains/subscribe-session';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_TABS,
} from '@/lib/subscribe/feed-view';

type TabIcon = Component<{ class?: string }>;

export const SUBSCRIBE_TIMELINE_TABS: Array<{
  id: SubscribeTimelineKind;
  label: string;
  Icon: TabIcon;
}> = [
  { id: 'all', label: '全部', Icon: RssIcon },
  { id: 'today', label: '今日', Icon: RecordIcon },
  { id: 'unread', label: '未读', Icon: BookmarkIcon },
  { id: 'starred', label: '收藏', Icon: StarIcon },
];

export const SUBSCRIBE_TIMELINE_LABELS: Record<SubscribeTimelineKind, string> = {
  all: '全部',
  today: '今日',
  unread: '未读',
  starred: '收藏',
};

/** 页头右侧双 AppSelect 统一宽度 */
export const SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS = 'h-9 w-32';

export { SUBSCRIBE_FEED_VIEW_LABELS, SUBSCRIBE_FEED_VIEW_TABS };
