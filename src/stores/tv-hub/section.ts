/**
 * 影视 Hub 分区状态 + tv.session 持久化
 */

import { createStore } from 'solid-js/store';
import type { TvHubSection } from '@/lib/media/tv/types';
import {
  bindTvSessionPersistAppliers,
  normalizeTvNavSection,
  scheduleTvSessionPersist,
  TV_SESSION_VERSION,
  type TvSessionSnapshot,
} from '@/lib/persistence/domains/tv-session';

const SIDEBAR_SECTIONS: TvHubSection[] = [
  'home',
  'live',
  'search',
  'keep',
  'history',
  'settings',
];

function isSidebarSection(section: TvHubSection): boolean {
  return SIDEBAR_SECTIONS.includes(section);
}

const [tvHubState, setTvHubState] = createStore({
  section: 'home' as TvHubSection,
  /** 侧栏高亮分区；进入 detail/play 时保持不变 */
  navSection: 'home' as TvHubSection,
  /** detail/play 上下文 */
  siteKey: '',
  vodId: '',
});

function captureSession(): TvSessionSnapshot {
  return {
    version: TV_SESSION_VERSION,
    section: tvHubState.section,
    navSection: tvHubState.navSection,
    siteKey: tvHubState.siteKey,
    vodId: tvHubState.vodId,
  };
}

bindTvSessionPersistAppliers({
  apply: (snap) => {
    setTvHubState({
      section: snap.section,
      navSection: snap.navSection ?? normalizeTvNavSection(snap.section),
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
  if (isSidebarSection(section)) {
    setTvHubState({ section, navSection: section });
  } else {
    setTvHubState('section', section);
  }
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

/** 侧栏应高亮的分区（detail/play 时沿用进入前的 tab） */
export function tvHubNavSectionValue(): TvHubSection {
  const section = tvHubState.section;
  if (section === 'detail' || section === 'play') {
    return tvHubState.navSection;
  }
  return normalizeTvNavSection(section);
}
