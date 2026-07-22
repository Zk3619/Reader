/**
 * tv.session：影视 Hub 导航分区 → settings.json；详情上下文 → sessionStorage（不跨重启）
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';
import { getEphemeral, setEphemeral } from '@/lib/persistence/backends/ephemeral-store';
import type { TvHubSection } from '@/lib/media/tv/types';

export const TV_SESSION_DOMAIN_ID = 'tv.session';
export const TV_SESSION_STORAGE_KEY = 'tv_nav_v1';
/** 旧 session.json 键（仅迁移） */
export const TV_SESSION_DOC_KEY = 'tv.session';
export const TV_SESSION_VERSION = 1;

const EPHEMERAL_DETAIL_KEY = 'tv.detailContext';

export interface TvSessionSnapshot {
  version: typeof TV_SESSION_VERSION;
  section: TvHubSection;
  /** 侧栏高亮分区（detail/play 时与 section 分离） */
  navSection: TvHubSection;
  siteKey: string;
  vodId: string;
}

type TvSessionAppliers = {
  apply: (snap: TvSessionSnapshot) => void;
  capture: () => TvSessionSnapshot;
};

let appliers: TvSessionAppliers | null = null;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

const NAV_SECTIONS: TvHubSection[] = [
  'home',
  'live',
  'search',
  'keep',
  'history',
  'library',
  'sniff',
  'bangumi',
  'settings',
];

export function normalizeTvNavSection(section: unknown): TvHubSection {
  if (typeof section === 'string' && NAV_SECTIONS.includes(section as TvHubSection)) {
    return section as TvHubSection;
  }
  if (section === 'detail' || section === 'play') return 'home';
  return 'home';
}

export function bindTvSessionPersistAppliers(next: TvSessionAppliers): void {
  appliers = next;
}

export async function persistTvSessionSnapshot(
  snap: TvSessionSnapshot,
): Promise<void> {
  const navSection = normalizeTvNavSection(snap.navSection ?? snap.section);
  await setStorage(TV_SESSION_STORAGE_KEY, {
    version: TV_SESSION_VERSION,
    section: navSection,
    navSection,
  });
  if (snap.section === 'detail' || snap.section === 'play') {
    setEphemeral(EPHEMERAL_DETAIL_KEY, {
      section: snap.section,
      siteKey: snap.siteKey ?? '',
      vodId: snap.vodId ?? '',
    });
  }
}

export function scheduleTvSessionPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const snap = appliers?.capture();
    if (snap) void persistTvSessionSnapshot(snap);
  }, 300);
}

export function createTvSessionPersistDomain(): PersistDomain {
  return {
    id: TV_SESSION_DOMAIN_ID,
    version: TV_SESSION_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      let navSection: TvHubSection = 'home';
      const stored = await getStorage<{
        version: number;
        section: TvHubSection;
        navSection?: TvHubSection;
      }>(TV_SESSION_STORAGE_KEY);
      if (stored?.version === TV_SESSION_VERSION) {
        navSection = normalizeTvNavSection(stored.navSection ?? stored.section);
      } else {
        const legacy = await getSessionDoc<TvSessionSnapshot>(TV_SESSION_DOC_KEY);
        if (legacy?.version === TV_SESSION_VERSION) {
          navSection = normalizeTvNavSection(legacy.navSection ?? legacy.section);
          await setStorage(TV_SESSION_STORAGE_KEY, {
            version: TV_SESSION_VERSION,
            section: navSection,
            navSection,
          });
        }
      }
      const detail = getEphemeral<{
        section: TvHubSection;
        siteKey: string;
        vodId: string;
      }>(EPHEMERAL_DETAIL_KEY);
      appliers?.apply({
        version: TV_SESSION_VERSION,
        section: navSection,
        navSection,
        siteKey: detail?.siteKey ?? '',
        vodId: detail?.vodId ?? '',
      });
    },
    persist: async () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      const snap = appliers?.capture();
      if (snap) await persistTvSessionSnapshot(snap);
    },
    flush: async () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      const snap = appliers?.capture();
      if (snap) await persistTvSessionSnapshot(snap);
    },
    exportSnapshot: async () =>
      appliers?.capture() ?? {
        version: TV_SESSION_VERSION,
        section: 'home' as TvHubSection,
        navSection: 'home' as TvHubSection,
        siteKey: '',
        vodId: '',
      },
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as TvSessionSnapshot;
      if (snap.version !== TV_SESSION_VERSION) return;
      await persistTvSessionSnapshot(snap);
      appliers?.apply(snap);
    },
  };
}

export function registerTvSessionPersistDomain(): void {
  registerPersistDomain(createTvSessionPersistDomain());
}
