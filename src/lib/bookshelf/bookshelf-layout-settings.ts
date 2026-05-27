/**
 * 书架布局设置类型与默认值（供 store 与持久化共用）
 */

export type GroupStyle = 'dropdown' | 'tabs' | 'normal';

export type ViewMode =
  | 'list'
  | 'list-2'
  | 'list-3'
  | 'compact'
  | 'compact-2'
  | 'compact-3'
  | 'grid-2'
  | 'grid-3'
  | 'grid-4'
  | 'grid-5'
  | 'grid-6'
  | 'grid-7'
  | 'grid-8';

export type SortMode =
  | 'read-time'
  | 'update-time'
  | 'book-name'
  | 'manual'
  | 'comprehensive'
  | 'author';

export type BookTitleDisplay = 'show' | 'hide' | 'overlay';

export interface BookshelfLayoutSettings {
  groupStyle: GroupStyle;
  viewMode: ViewMode;
  sortMode: SortMode;
  bookTitleDisplay: BookTitleDisplay;
  spacing: number;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  showPendingUpdateCount: boolean;
  showQuickScrollbar: boolean;
  coverClickPreview: boolean;
}

export const defaultBookshelfLayoutSettings: BookshelfLayoutSettings = {
  groupStyle: 'normal',
  viewMode: 'grid-4',
  sortMode: 'read-time',
  bookTitleDisplay: 'show',
  spacing: 12,
  showUnreadFlag: true,
  showLastUpdateTime: true,
  showPendingUpdateCount: false,
  showQuickScrollbar: false,
  coverClickPreview: true,
};
