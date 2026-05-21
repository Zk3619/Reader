/**
 * 探索页布局设置（与书架 groupStyle 独立）
 */

import { createStore } from 'solid-js/store';
import { getStorage, setStorage } from '@/lib/platform/storage';

export interface ExplorePageLayoutSettings {
  /** 标题区使用书源下拉 */
  sourceDropdownEnabled: boolean;
  /** 标题下方显示书源标签 */
  sourceTabsEnabled: boolean;
}

/** @deprecated 旧版单选样式，仅用于迁移 */
type LegacySourceNavStyle = 'normal' | 'dropdown' | 'tabs';

type StoredExplorePageLayout = ExplorePageLayoutSettings & {
  sourceNavStyle?: LegacySourceNavStyle;
};

const defaultSettings: ExplorePageLayoutSettings = {
  sourceDropdownEnabled: false,
  sourceTabsEnabled: false,
};

const STORAGE_KEY = 'explore-page-layout-settings';

function normalizeSettings(saved: StoredExplorePageLayout | null): ExplorePageLayoutSettings {
  if (!saved) return defaultSettings;
  if (typeof saved.sourceDropdownEnabled === 'boolean' || typeof saved.sourceTabsEnabled === 'boolean') {
    return {
      sourceDropdownEnabled: saved.sourceDropdownEnabled ?? false,
      sourceTabsEnabled: saved.sourceTabsEnabled ?? false,
    };
  }
  const legacy = saved.sourceNavStyle;
  if (legacy === 'dropdown') {
    return { sourceDropdownEnabled: true, sourceTabsEnabled: false };
  }
  if (legacy === 'tabs') {
    return { sourceDropdownEnabled: false, sourceTabsEnabled: true };
  }
  return defaultSettings;
}

async function loadSettings(): Promise<ExplorePageLayoutSettings> {
  try {
    const saved = await getStorage<StoredExplorePageLayout>(STORAGE_KEY);
    return normalizeSettings(saved);
  } catch (error) {
    console.warn('[探索页布局] 加载设置失败，使用默认设置:', error);
  }
  return defaultSettings;
}

async function saveSettings(settings: ExplorePageLayoutSettings): Promise<void> {
  try {
    await setStorage(STORAGE_KEY, settings);
  } catch (error) {
    console.error('[探索页布局] 保存设置失败:', error);
  }
}

const [settings, setSettings] = createStore<ExplorePageLayoutSettings>(defaultSettings);

let initialized = false;
export async function initExplorePageLayoutSettings(): Promise<void> {
  if (initialized) return;
  const loaded = await loadSettings();
  setSettings(loaded);
  initialized = true;
}

export const explorePageLayoutStore = {
  get settings() {
    return settings;
  },

  updateSettings(updates: Partial<ExplorePageLayoutSettings>): void {
    setSettings(updates);
    saveSettings({ ...settings, ...updates }).catch(console.error);
  },
};
