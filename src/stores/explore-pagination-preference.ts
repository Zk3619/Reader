/**
 * 探索页分页偏好（滚动加载 / 分页列表），供列表与设置对话框共享
 */

import { createMemo } from 'solid-js';
import {
  explorePageLayoutStore,
  initExplorePageLayoutSettings,
  type ExplorePaginationPreference,
} from '@/stores/explore-page-layout';

export type PaginationPreference = ExplorePaginationPreference;

export const EXPLORE_PAGINATION_PREFERENCE_KEY = 'explore_pagination_preference';

export function explorePaginationPreference(): PaginationPreference {
  return explorePageLayoutStore.settings.paginationPreference;
}

export async function initExplorePaginationPreference(): Promise<void> {
  await initExplorePageLayoutSettings();
}

export async function setExplorePaginationPreference(pref: PaginationPreference): Promise<void> {
  explorePageLayoutStore.updateSettings({ paginationPreference: pref });
}

/** 响应式分页偏好（对话框本地状态同步用） */
export function useExplorePaginationPreference() {
  return createMemo(() => explorePageLayoutStore.settings.paginationPreference);
}
