/**
 * 订阅模块会话状态
 */

import { createStore } from 'solid-js/store';
import {
  bindSubscribeSessionPersistAppliers,
  scheduleSubscribeSessionPersist,
  SUBSCRIBE_SESSION_VERSION,
  type SubscribeFeedViewKind,
  type SubscribeHubSection,
  type SubscribeSessionSnapshot,
  type SubscribeTimelineKind,
} from '@/lib/persistence/domains/subscribe-session';

const [subscribeState, setSubscribeState] = createStore({
  section: 'home' as SubscribeHubSection,
  activeSourceId: '',
  activeEntryId: '',
  entryQuery: '',
  timeline: 'all' as SubscribeTimelineKind,
  feedView: 'all' as SubscribeFeedViewKind,
});

bindSubscribeSessionPersistAppliers({
  apply: (snap) => {
    setSubscribeState('section', snap.section);
    setSubscribeState('activeSourceId', snap.activeSourceId);
    setSubscribeState('activeEntryId', snap.activeEntryId);
    setSubscribeState('entryQuery', snap.entryQuery);
    setSubscribeState('timeline', snap.timeline);
    setSubscribeState('feedView', snap.feedView);
  },
  capture: (): SubscribeSessionSnapshot => ({
    version: SUBSCRIBE_SESSION_VERSION,
    section: subscribeState.section,
    activeSourceId: subscribeState.activeSourceId,
    activeEntryId: subscribeState.activeEntryId,
    entryQuery: subscribeState.entryQuery,
    timeline: subscribeState.timeline,
    feedView: subscribeState.feedView,
  }),
});

export function getSubscribeHubState() {
  return subscribeState;
}

export function setSubscribeSection(section: SubscribeHubSection): void {
  setSubscribeState('section', section);
  scheduleSubscribeSessionPersist();
}

export function setSubscribeActiveSource(sourceId: string): void {
  setSubscribeState('section', 'home');
  setSubscribeState('activeSourceId', sourceId);
  setSubscribeState('activeEntryId', '');
  scheduleSubscribeSessionPersist();
}

export function setSubscribeActiveEntry(entryId: string): void {
  setSubscribeState('activeEntryId', entryId);
  scheduleSubscribeSessionPersist();
}

export function setSubscribeEntryQuery(query: string): void {
  setSubscribeState('entryQuery', query);
  scheduleSubscribeSessionPersist();
}

export function setSubscribeTimeline(timeline: SubscribeTimelineKind): void {
  // 同值 no-op：避免 AppSelect 重渲误触 onChange 清掉已选源
  if (subscribeState.timeline === timeline) return;
  setSubscribeState('timeline', timeline);
  setSubscribeState('activeSourceId', '');
  setSubscribeState('activeEntryId', '');
  scheduleSubscribeSessionPersist();
}

/** 切换 FeedView；默认清空源选中。keepSource 用于无匹配频道时回退「全部」 */
export function setSubscribeFeedView(
  feedView: SubscribeFeedViewKind,
  options?: { keepSource?: boolean },
): void {
  if (subscribeState.feedView === feedView) {
    // 同值且非强制回退时 no-op，避免误清源
    if (!options?.keepSource) return;
    scheduleSubscribeSessionPersist();
    return;
  }
  setSubscribeState('feedView', feedView);
  if (!options?.keepSource) {
    setSubscribeState('activeSourceId', '');
    setSubscribeState('activeEntryId', '');
  }
  scheduleSubscribeSessionPersist();
}

/** 回到首页聚合：清源选中，保留 feedView / timeline */
export function goSubscribeHome(): void {
  setSubscribeState('section', 'home');
  setSubscribeState('activeSourceId', '');
  setSubscribeState('activeEntryId', '');
  scheduleSubscribeSessionPersist();
}

export function subscribeHubSectionValue(): SubscribeHubSection {
  return subscribeState.section;
}
