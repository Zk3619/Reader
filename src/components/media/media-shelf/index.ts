/**
 * MediaShelf 组件（新名称 re-export，实现仍在 bookshelf 目录过渡期保留）
 */

export {
  GroupContextMenu as MediaGroupContextMenu,
  GroupContextMenuContent as MediaGroupContextMenuContent,
  type GroupContextMenuActions as MediaGroupContextMenuActions,
  type GroupContextMenuProps as MediaGroupContextMenuProps,
} from '@/components/media/reader/bookshelf/BookGroupContextMenu';

export { BookGroupFormDialog as MediaGroupFormDialog } from '@/components/media/reader/bookshelf/BookGroupFormDialog';
export { BookGroupPickDialog as MediaGroupPickDialog } from '@/components/media/reader/bookshelf/BookGroupPickDialog';
export { BookGroupManagePageToolbar as MediaGroupManagePageToolbar } from '@/components/media/reader/bookshelf/BookGroupManagePageToolbar';
export { BookGroupCoverFace as MediaGroupCoverFace } from '@/components/media/reader/bookshelf/BookGroupCoverFace';
export { VirtualBookGroupManageList as VirtualMediaGroupManageList } from '@/components/media/reader/bookshelf/VirtualBookGroupManageList';

export {
  BookshelfPageToolbar as MediaShelfPageToolbar,
  type BookshelfPageToolbarProps as MediaShelfPageToolbarProps,
} from '@/components/media/reader/bookshelf/BookshelfPageToolbar';

export {
  BookshelfGroupNav as MediaShelfGroupNav,
  BookshelfGroupTitleDropdown as MediaShelfGroupTitleDropdown,
} from '@/components/media/reader/bookshelf/BookshelfGroupNav';

export { BookshelfLayoutDialog as MediaShelfLayoutDialog } from '@/components/media/reader/bookshelf/BookshelfLayoutDialog';
export { BookshelfLayoutGrid as MediaShelfLayoutGrid } from '@/components/media/reader/bookshelf/BookshelfLayoutGrid';

export { VirtualBookshelfBookGrid as VirtualMediaShelfItemGrid } from '@/components/media/reader/bookshelf/VirtualBookshelfBookGrid';
export { VirtualBookshelfBookList as VirtualMediaShelfItemList } from '@/components/media/reader/bookshelf/VirtualBookshelfBookList';
export { BookShelfListBookRow as MediaShelfListItemRow } from '@/components/media/reader/bookshelf/BookShelfListBookRow';
