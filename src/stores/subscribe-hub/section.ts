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
} from '@/lib/persistence/domains/subscribe-session';

const [subscribeState, setSubscribeState] = createStore({
  section: 'home' as SubscribeHubSection,
  activeSourceId: '',
  entryQuery: '',
  unreadOnly: false,
  starredOnly: false,
});

bindSubscribeSessionPersistAppliers({
  apply: (snap) => {
    setSubscribeState('section', snap.section);
    setSubscribeState('activeSourceId', snap.activeSourceId);
    setSubscribeState('entryQuery', snap.entryQuery);
    setSubscribeState('unreadOnly', snap.unreadOnly);
    setSubscribeState('starredOnly', snap.starredOnly);
  },
  capture: (): SubscribeSessionSnapshot => ({
    version: SUBSCRIBE_SESSION_VERSION,
    section: subscribeState.section,
    activeSourceId: subscribeState.activeSourceId,
    entryQuery: subscribeState.entryQuery,
    unreadOnly: subscribeState.unreadOnly,
    starredOnly: subscribeState.starredOnly,
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
  scheduleSubscribeSessionPersist();
}

export function setSubscribeEntryQuery(query: string): void {
  setSubscribeState('entryQuery', query);
  scheduleSubscribeSessionPersist();
}

export function setSubscribeUnreadOnly(unreadOnly: boolean): void {
  setSubscribeState('unreadOnly', unreadOnly);
  scheduleSubscribeSessionPersist();
}

export function setSubscribeStarredOnly(starredOnly: boolean): void {
  setSubscribeState('starredOnly', starredOnly);
  scheduleSubscribeSessionPersist();
}

export function subscribeHubSectionValue(): SubscribeHubSection {
  return subscribeState.section;
}
