/**
 * 探索页分页偏好（滚动加载 / 分页列表），供列表与设置对话框共享
 */

import { createSignal } from 'solid-js';
import { getStorage, setStorage } from '@/lib/platform/storage';

export type PaginationPreference = 'scroll' | 'pagination';

export const EXPLORE_PAGINATION_PREFERENCE_KEY = 'explore_pagination_preference';

const DEFAULT: PaginationPreference = 'scroll';

const [preference, setPreference] = createSignal<PaginationPreference>(DEFAULT);
let initPromise: Promise<void> | null = null;

export function explorePaginationPreference() {
  return preference();
}

export async function initExplorePaginationPreference(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const saved = await getStorage<PaginationPreference>(EXPLORE_PAGINATION_PREFERENCE_KEY);
      if (saved === 'scroll' || saved === 'pagination') {
        setPreference(saved);
      }
    })();
  }
  await initPromise;
}

export async function setExplorePaginationPreference(pref: PaginationPreference): Promise<void> {
  setPreference(pref);
  await setStorage(EXPLORE_PAGINATION_PREFERENCE_KEY, pref);
}
