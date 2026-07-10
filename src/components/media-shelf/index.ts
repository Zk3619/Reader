/**
 * MediaShelf 组件（新名称 re-export，实现仍在 bookshelf 目录过渡期保留）
 */

export {
  GroupContextMenu as MediaGroupContextMenu,
  GroupContextMenuContent as MediaGroupContextMenuContent,
  type GroupContextMenuActions as MediaGroupContextMenuActions,
  type GroupContextMenuProps as MediaGroupContextMenuProps,
} from '@/components/bookshelf/BookGroupContextMenu';

export { BookGroupFormDialog as MediaGroupFormDialog } from '@/components/bookshelf/BookGroupFormDialog';
export { BookGroupPickDialog as MediaGroupPickDialog } from '@/components/bookshelf/BookGroupPickDialog';
export { BookGroupManagePageToolbar as MediaGroupManagePageToolbar } from '@/components/bookshelf/BookGroupManagePageToolbar';
export { BookGroupCoverFace as MediaGroupCoverFace } from '@/components/bookshelf/BookGroupCoverFace';
export { VirtualBookGroupManageList as VirtualMediaGroupManageList } from '@/components/bookshelf/VirtualBookGroupManageList';

export {
  BookshelfPageToolbar as MediaShelfPageToolbar,
  type BookshelfPageToolbarProps as MediaShelfPageToolbarProps,
} from '@/components/bookshelf/BookshelfPageToolbar';

export {
  BookshelfGroupNav as MediaShelfGroupNav,
  BookshelfGroupTitleDropdown as MediaShelfGroupTitleDropdown,
} from '@/components/bookshelf/BookshelfGroupNav';

export { BookshelfLayoutDialog as MediaShelfLayoutDialog } from '@/components/bookshelf/BookshelfLayoutDialog';
export { BookshelfLayoutGrid as MediaShelfLayoutGrid } from '@/components/bookshelf/BookshelfLayoutGrid';

export { VirtualBookshelfBookGrid as VirtualMediaShelfItemGrid } from '@/components/bookshelf/VirtualBookshelfBookGrid';
export { VirtualBookshelfBookList as VirtualMediaShelfItemList } from '@/components/bookshelf/VirtualBookshelfBookList';
export { BookShelfListBookRow as MediaShelfListItemRow } from '@/components/bookshelf/BookShelfListBookRow';
