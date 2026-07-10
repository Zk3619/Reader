/**
 * 书架导航状态上下文：全局文本书架或 scoped 媒体书架
 */

import { createContext, useContext, type JSX } from 'solid-js';
import { bookshelfStore } from '@/stores/bookshelf';
import type { ShelfNavigationStore } from '@/stores/scoped-bookshelf';

const ShelfNavigationContext = createContext<ShelfNavigationStore>(
  bookshelfStore as ShelfNavigationStore,
);

export function ShelfNavigationProvider(props: {
  store: ShelfNavigationStore;
  children: JSX.Element;
}) {
  return (
    <ShelfNavigationContext.Provider value={props.store}>
      {props.children}
    </ShelfNavigationContext.Provider>
  );
}

export function useShelfNavigation(): ShelfNavigationStore {
  return useContext(ShelfNavigationContext);
}
