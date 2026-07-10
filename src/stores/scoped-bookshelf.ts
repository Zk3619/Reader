/**
 * 各媒体 Tab 独立的书架导航状态（currentGroup / showGroupList）
 * 不污染全局 bookshelf_currentGroup
 */

import { createStore } from 'solid-js/store';
import { getStorage, setStorage } from '@/lib/platform/storage';

export interface ShelfNavigationState {
  currentGroup: number;
  currentGroupName: string;
  showGroupList: boolean;
}

export interface ShelfNavigationStore {
  get state(): ShelfNavigationState;
  setCurrentGroup(groupId: number): void;
  setCurrentGroupName(name: string): void;
  setShowGroupList(show: boolean): void;
  waitForStateRestore(): Promise<void>;
  get isStateRestored(): boolean;
}

const scopedStores = new Map<string, ShelfNavigationStore>();

function storageKey(scope: string, field: 'group' | 'groupName' | 'showGroupList'): string {
  switch (field) {
    case 'group':
      return `mediabox_shelf_group_${scope}`;
    case 'groupName':
      return `mediabox_shelf_group_name_${scope}`;
    case 'showGroupList':
      return `mediabox_shelf_show_group_list_${scope}`;
  }
}

function createScopedBookshelfStore(scope: string): ShelfNavigationStore {
  const [state, setState] = createStore<ShelfNavigationState>({
    currentGroup: -1,
    currentGroupName: '全部',
    showGroupList: true,
  });

  let stateRestored = false;
  const stateRestoredPromise = (async () => {
    try {
      const [currentGroup, currentGroupName, showGroupList] = await Promise.all([
        getStorage<number>(storageKey(scope, 'group')),
        getStorage<string>(storageKey(scope, 'groupName')),
        getStorage<boolean>(storageKey(scope, 'showGroupList')),
      ]);
      setState({
        currentGroup: currentGroup ?? -1,
        currentGroupName: currentGroupName ?? '全部',
        showGroupList: showGroupList ?? true,
      });
    } catch (error) {
      console.warn(`恢复 scoped 书架状态失败 (${scope}):`, error);
    } finally {
      stateRestored = true;
    }
  })();

  return {
    get state() {
      return state;
    },
    setCurrentGroup(groupId: number) {
      setState({ currentGroup: groupId });
      setStorage(storageKey(scope, 'group'), groupId).catch((error) => {
        console.warn('保存 scoped 当前分组失败:', error);
      });
    },
    setCurrentGroupName(name: string) {
      setState({ currentGroupName: name });
      setStorage(storageKey(scope, 'groupName'), name).catch((error) => {
        console.warn('保存 scoped 分组名称失败:', error);
      });
    },
    setShowGroupList(show: boolean) {
      setState({ showGroupList: show });
      setStorage(storageKey(scope, 'showGroupList'), show).catch((error) => {
        console.warn('保存 scoped 显示分组页状态失败:', error);
      });
    },
    async waitForStateRestore() {
      await stateRestoredPromise;
    },
    get isStateRestored() {
      return stateRestored;
    },
  };
}

export function getScopedBookshelfStore(scope: string): ShelfNavigationStore {
  let store = scopedStores.get(scope);
  if (!store) {
    store = createScopedBookshelfStore(scope);
    scopedStores.set(scope, store);
  }
  return store;
}
