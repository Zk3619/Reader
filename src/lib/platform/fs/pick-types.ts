import type { FsLayer } from '@/lib/platform/fs/capabilities';
import type { StorageRef } from '@/lib/platform/fs/storage-ref';

export interface FilePickerFilter {
  name: string;
  extensions: string[];
}

export interface PickFileOptions {
  filters?: FilePickerFilter[];
  multiple?: boolean;
  /** 不弹窗，直接返回托管目录中的占位（由调用方处理） */
  managedOnly?: boolean;
}

export interface PickDirectoryOptions {
  /** 用于设置页保存书籍库根目录 */
  forBooksStorage?: boolean;
}

export interface PickResult {
  ref: StorageRef;
  fileName: string;
  bytes?: ArrayBuffer;
  sourceLayer: FsLayer;
  /** 原始 File（L4 降级） */
  legacyFile?: File;
}

export interface PickDirectoryResult {
  ref: StorageRef;
  sourceLayer: FsLayer;
}

export const DEFAULT_BOOK_FILTERS: FilePickerFilter[] = [
  { name: '支持的类型', extensions: ['txt', 'epub'] },
  { name: 'TXT', extensions: ['txt'] },
  { name: 'EPUB', extensions: ['epub'] },
];
