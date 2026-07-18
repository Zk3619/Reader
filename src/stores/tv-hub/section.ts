/**
 * 影视 Hub 分区状态 + tv.session 持久化
 */

import { createStore } from 'solid-js/store';
import type { TvHubSection } from '@/lib/media/tv/types';
import {
  bindTvSessionPersistAppliers,
  scheduleTvSessionPersist,
  TV_SESSION_VERSION,
  type TvSessionSnapshot,
} from '@/lib/persistence/domains/tv-session';

const [tvHubState, setTvHubState] = createStore({
  section: 'home' as TvHubSection,
  /** detail/play 上下文 */
  siteKey: '',
  vodId: '',
});

function captureSession(): TvSessionSnapshot {
  return {
    version: TV_SESSION_VERSION,
    section: tvHubState.section,
    siteKey: tvHubState.siteKey,
    vodId: tvHubState.vodId,
  };
}

bindTvSessionPersistAppliers({
  apply: (snap) => {
    setTvHubState({
      section: snap.section,
      siteKey: snap.siteKey,
      vodId: snap.vodId,
    });
  },
  capture: captureSession,
});

export function getTvHubState() {
  return tvHubState;
}

export function setTvSection(section: TvHubSection): void {
  setTvHubState('section', section);
  scheduleTvSessionPersist();
}

export function openTvDetail(siteKey: string, vodId: string): void {
  setTvHubState({ siteKey, vodId, section: 'detail' });
  scheduleTvSessionPersist();
}

export function openTvPlay(): void {
  setTvHubState('section', 'play');
  scheduleTvSessionPersist();
}

export function tvHubSectionValue(): TvHubSection {
  return tvHubState.section;
}
