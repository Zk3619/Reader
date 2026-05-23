/**
 * 书源导入黑名单（内置 18+ 列表 + 用户自定义）
 */

import { createStore } from 'solid-js/store';
import { getStorage, setStorage } from '@/lib/platform/storage';

export interface SourceBlocklistEntry {
  id: string;
  /** 域名（example.com）或完整 URL 片段 */
  value: string;
  label?: string;
  enabled: boolean;
  /** 内置项不可删除 */
  builtin?: boolean;
}

const STORAGE_KEY = 'source_import_blocklist';

interface BlocklistState {
  userEntries: SourceBlocklistEntry[];
  loaded: boolean;
}

const [state, setState] = createStore<BlocklistState>({
  userEntries: [],
  loaded: false,
});

export const sourceBlocklistStore = {
  get state() {
    return state;
  },

  async load(): Promise<void> {
    const stored = await getStorage<SourceBlocklistEntry[]>(STORAGE_KEY);
    setState({
      userEntries: Array.isArray(stored) ? stored : [],
      loaded: true,
    });
  },

  async saveUserEntries(entries: SourceBlocklistEntry[]): Promise<void> {
    const userOnly = entries.filter((e) => !e.builtin);
    setState('userEntries', userOnly);
    await setStorage(STORAGE_KEY, userOnly);
  },

  async addEntry(value: string, label?: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next: SourceBlocklistEntry = {
      id: `user-${Date.now()}`,
      value: trimmed,
      label: label?.trim() || undefined,
      enabled: true,
    };
    const merged = [...state.userEntries, next];
    await this.saveUserEntries(merged);
  },

  async removeEntry(id: string): Promise<void> {
    await this.saveUserEntries(state.userEntries.filter((e) => e.id !== id));
  },

  async setEntryEnabled(id: string, enabled: boolean): Promise<void> {
    const next = state.userEntries.map((e) =>
      e.id === id ? { ...e, enabled } : e
    );
    await this.saveUserEntries(next);
  },
};
