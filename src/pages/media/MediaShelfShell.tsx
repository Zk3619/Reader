/**
 * 参数化书架壳层：各媒体 Tab 独立分组导航状态 + 按 MediaKind 过滤
 */

import type { MediaKind } from '@/lib/book-source/book-type';
import { MediaShelfPage, type MediaShelfPageProps } from '@/pages/media-shelf/MediaShelfPage';
import { getScopedBookshelfStore } from '@/stores/scoped-media-shelf';
import { ShelfNavigationProvider } from '@/stores/shelf-navigation-context';

export interface MediaShelfShellProps extends MediaShelfPageProps {
  mediaKind: MediaKind;
  scope: string;
}

export function MediaShelfShell(props: MediaShelfShellProps) {
  const store = getScopedBookshelfStore(props.scope);
  return (
    <ShelfNavigationProvider store={store}>
      <MediaShelfPage {...props} mediaKindFilter={props.mediaKind} />
    </ShelfNavigationProvider>
  );
}
