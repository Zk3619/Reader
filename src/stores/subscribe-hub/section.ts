/**
 * 订阅模块会话状态（Folo 占位）
 */

import { createStore } from 'solid-js/store';
import {
  bindSubscribeSessionPersistAppliers,
  scheduleSubscribeSessionPersist,
  SUBSCRIBE_SESSION_VERSION,
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
});

bindSubscribeSessionPersistAppliers({
  apply: (snap) => {
    setSubscribeState('section', snap.section);
    setSubscribeState('activeSourceId', snap.activeSourceId);
    setSubscribeState('activeEntryId', snap.activeEntryId);
    setSubscribeState('entryQuery', snap.entryQuery);
    setSubscribeState('timeline', snap.timeline);
  },
  capture: (): SubscribeSessionSnapshot => ({
    version: SUBSCRIBE_SESSION_VERSION,
    section: subscribeState.section,
    activeSourceId: subscribeState.activeSourceId,
    activeEntryId: subscribeState.activeEntryId,
    entryQuery: subscribeState.entryQuery,
    timeline: subscribeState.timeline,
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
  setSubscribeState('timeline', timeline);
  setSubscribeState('activeSourceId', '');
  setSubscribeState('activeEntryId', '');
  scheduleSubscribeSessionPersist();
}

export function subscribeHubSectionValue(): SubscribeHubSection {
  return subscribeState.section;
}
