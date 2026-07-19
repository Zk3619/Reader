/**
 * 探索网格单元上下文：稳定模块级 Cell，避免 VirtualGrid children 闭包 + 全表 Map 订阅。
 */

import { createContext, useContext, type ParentProps } from 'solid-js';
import { ExploreBookListCell } from '@/components/media/reader/explore/ExploreBookListCell';
import { ExploreBookTextListCell } from '@/components/media/reader/explore/ExploreBookTextListCell';
import { ExploreBookGridCardCell } from '@/components/media/reader/explore/ExploreBookGridCardCell';
import type { ExploreBooksStore } from '@/components/media/reader/explore/explore-books-store';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';
import type { BookSource, SearchBook } from '@/types';

export type ExploreBookGridContextValue = {
  store: ExploreBooksStore;
  source: BookSource;
  onOpen: (book: SearchBook) => void;
  /** 使用 store.patchCoverUrl，保持引用稳定 */
  onCoverUrlRefreshed: ExploreBooksStore['patchCoverUrl'];
};

const ExploreBookGridContext = createContext<ExploreBookGridContextValue>();

export function ExploreBookGridProvider(
  props: ParentProps<{ value: ExploreBookGridContextValue }>,
) {
  return (
    <ExploreBookGridContext.Provider value={props.value}>
      {props.children}
    </ExploreBookGridContext.Provider>
  );
}

/** 模块级稳定引用，供 VirtualGrid renderEntityByKey 使用（须在 Provider 内） */
export function renderExploreBookGridCell(entityKey: string) {
  return <ExploreBookGridCell bookUrl={entityKey} />;
}

/** 由 VirtualGrid For 按 entityKey（bookUrl）挂载，不经过 children 渲染函数 */
export function ExploreBookGridCell(props: { bookUrl: string }) {
  const ctx = useContext(ExploreBookGridContext);
  if (!ctx) return null;

  const layoutMode = () => explorePageLayoutStore.settings.dataLayoutMode;

  if (layoutMode() === 'text-list') {
    return (
      <ExploreBookTextListCell
        bookUrl={props.bookUrl}
        booksByUrl={ctx.store.booksByUrl}
        onOpen={ctx.onOpen}
      />
    );
  }

  if (layoutMode() === 'card-grid') {
    return (
      <ExploreBookGridCardCell
        bookUrl={props.bookUrl}
        booksByUrl={ctx.store.booksByUrl}
        source={ctx.source}
        onOpen={ctx.onOpen}
        onCoverUrlRefreshed={ctx.onCoverUrlRefreshed}
      />
    );
  }

  return (
    <ExploreBookListCell
      bookUrl={props.bookUrl}
      booksByUrl={ctx.store.booksByUrl}
      source={ctx.source}
      onOpen={ctx.onOpen}
      onCoverUrlRefreshed={ctx.onCoverUrlRefreshed}
    />
  );
}
