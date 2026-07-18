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
});

bindSubscribeSessionPersistAppliers({
  apply: (snap) => {
    setSubscribeState('section', snap.section);
  },
  capture: (): SubscribeSessionSnapshot => ({
    version: SUBSCRIBE_SESSION_VERSION,
    section: subscribeState.section,
  }),
});

export function getSubscribeHubState() {
  return subscribeState;
}

export function setSubscribeSection(section: SubscribeHubSection): void {
  setSubscribeState('section', section);
  scheduleSubscribeSessionPersist();
}

export function subscribeHubSectionValue(): SubscribeHubSection {
  return subscribeState.section;
}
