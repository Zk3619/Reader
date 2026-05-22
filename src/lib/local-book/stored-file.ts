/**
 * 本地书在各类 StorageRef 上的存储与删除（Web：用户文件夹 / OPFS / 缓存）
 */

import { isTauri } from '@/lib/platform/detect';
import { mayUseAndroidFsLayer } from '@/lib/platform/fs/capabilities';
import { removeRef } from '@/lib/platform/fs/read-write';
import { parseStorageRef, type StorageRefKind } from '@/lib/platform/fs/storage-ref';
import { settingsStore } from '@/stores/settings';

const HANDLE_DIR_PREFIX = 'handle:dir:';
const HANDLE_FILE_PREFIX = 'handle:file:';

export function localBookStorageKind(bookUrl: string): StorageRefKind | 'legacy-local' {
  if (bookUrl.startsWith('local::')) return 'legacy-local';
  return parseStorageRef(bookUrl).kind;
}

/** Web 端删除/提示文案用的存储类型 */
export type WebLocalDeleteStorageKind =
  | 'user-folder'
  | 'opfs'
  | 'browser-cache'
  | 'unknown';

function booksRootIsUserFolder(): boolean {
  const root = settingsStore.state.app.booksStorageRoot?.trim();
  return Boolean(root?.startsWith(HANDLE_DIR_PREFIX));
}

/**
 * 按 bookUrl（及书籍库设置）判断 Web 端正文落在何处。
 * 须优先识别 `handle:dir:{id}/文件名`，避免与 `handle:file:` 混淆。
 */
export function resolveWebLocalDeleteStorageKind(
  bookUrl: string,
): WebLocalDeleteStorageKind | null {
  if (isTauri()) return null;

  if (bookUrl.startsWith(HANDLE_DIR_PREFIX)) {
    return 'user-folder';
  }
  if (bookUrl.startsWith('opfs:')) {
    return 'opfs';
  }
  if (bookUrl.startsWith('local::') || bookUrl.startsWith('virtual:')) {
    return 'browser-cache';
  }
  if (bookUrl.startsWith(HANDLE_FILE_PREFIX)) {
    return booksRootIsUserFolder() ? 'user-folder' : 'browser-cache';
  }

  const kind = localBookStorageKind(bookUrl);
  if (kind === 'dir-handle') return 'user-folder';
  if (kind === 'opfs') return 'opfs';
  if (kind === 'virtual' || kind === 'legacy-local') return 'browser-cache';
  return 'unknown';
}

/** Web 端书籍在 OPFS / IndexedDB 等浏览器私有存储（非用户选的文件夹） */
export function isWebPrivateStoredLocalBook(bookUrl: string): boolean {
  const k = resolveWebLocalDeleteStorageKind(bookUrl);
  return k === 'opfs' || k === 'browser-cache';
}

/** Web 端书籍在用户授权的本地文件夹（handle:dir） */
export function isWebUserFolderStoredLocalBook(bookUrl: string): boolean {
  return resolveWebLocalDeleteStorageKind(bookUrl) === 'user-folder';
}

/** 删除对话框默认是否勾选「删除存储副本」 */
export function defaultDeleteStoredFileForLocalBook(
  bookUrl: string,
  remembered?: boolean,
): boolean {
  if (remembered !== undefined) return remembered;
  if (isTauri()) return false;
  const k = resolveWebLocalDeleteStorageKind(bookUrl);
  return k === 'opfs' || k === 'browser-cache' || k === 'user-folder';
}

export async function removeLocalBookStoredFile(bookUrl: string): Promise<void> {
  if (bookUrl.startsWith('local::')) {
    await removeRef(parseStorageRef(bookUrl), false);
    return;
  }
  await removeRef(parseStorageRef(bookUrl), false);
}

export function deleteStoredFileCheckboxLabel(bookUrl: string): string {
  if (isTauri()) {
    return '同时删除本地文件';
  }
  switch (resolveWebLocalDeleteStorageKind(bookUrl)) {
    case 'user-folder':
      return '同时删除书籍库文件夹中的文件';
    case 'opfs':
      return '同时删除浏览器内置库（OPFS）中的副本';
    case 'browser-cache':
      return '同时删除浏览器缓存中的书籍数据';
    default:
      return '同时删除浏览器中的书籍副本';
  }
}

export function deleteStoredFileCheckboxHint(bookUrl: string): string {
  if (isTauri()) {
    return '删除书籍时，同时删除本地存储的书籍文件。';
  }
  switch (resolveWebLocalDeleteStorageKind(bookUrl)) {
    case 'user-folder':
      return '删除书架记录时，同时从您指定的本地书籍文件夹中移除该文件（不会删除文件夹外的原文件）。';
    case 'opfs':
      return '删除书架记录时，同时移除 OPFS 中保存的书籍文件（导入时已从原文件复制）。';
    case 'browser-cache':
      return '删除书架记录时，同时移除浏览器缓存中的书籍数据。';
    default:
      return '删除书架记录时，同时移除浏览器内保存的书籍副本。';
  }
}

export function describeDeleteLocalBookToast(
  bookUrl: string,
  bookName: string,
  options: { deleteFile: boolean; fileDeleteFailed: boolean },
): { title: string; description: string } {
  const { deleteFile, fileDeleteFailed } = options;
  const webKind = resolveWebLocalDeleteStorageKind(bookUrl);

  if (fileDeleteFailed) {
    if (isTauri() && mayUseAndroidFsLayer()) {
      const kind = localBookStorageKind(bookUrl);
      if (kind === 'uri' || kind === 'saf-tree') {
        return {
          title: '已从书架删除',
          description:
            '书籍库中的文件未能删除，请在文件管理器中打开书籍目录手动移除。',
        };
      }
    }
    if (webKind === 'user-folder') {
      return {
        title: '已从书架删除',
        description:
          '书籍库文件夹中的文件未能删除，请在该文件夹中手动移除，或重新授权目录后重试。',
      };
    }
    if (webKind === 'opfs') {
      return {
        title: '已从书架删除',
        description:
          'OPFS 中的书籍副本未能删除，可在开发者工具 Application → Storage 中清理。',
      };
    }
    if (webKind === 'browser-cache') {
      return {
        title: '已从书架删除',
        description:
          '浏览器缓存中的书籍数据未能删除，可在开发者工具中清理 IndexedDB。',
      };
    }
    return {
      title: '已从书架删除',
      description: '存储副本未能删除，请手动清理。',
    };
  }

  if (deleteFile) {
    if (isTauri() && mayUseAndroidFsLayer() && localBookStorageKind(bookUrl) === 'uri') {
      return {
        title: '已删除书籍及本地文件',
        description: `《${bookName}》已从书架移除，书籍库中的文件已删除。`,
      };
    }
    if (webKind === 'user-folder') {
      return {
        title: '已删除书籍及本地文件',
        description: `《${bookName}》已从书架移除，书籍库文件夹中的文件已删除。`,
      };
    }
    if (webKind === 'opfs') {
      return {
        title: '已删除书籍及本地文件',
        description: `《${bookName}》已从书架移除，OPFS 中的副本已删除。`,
      };
    }
    if (webKind === 'browser-cache') {
      return {
        title: '已删除书籍及本地文件',
        description: `《${bookName}》已从书架移除，浏览器缓存中的数据已删除。`,
      };
    }
    return {
      title: '已删除书籍及本地文件',
      description: `《${bookName}》已从书架移除。`,
    };
  }

  if (webKind === 'user-folder') {
    return {
      title: '已从书架删除',
      description: '书架记录已删除；书籍库文件夹中的文件仍保留。',
    };
  }
  if (webKind === 'opfs') {
    return {
      title: '已从书架删除',
      description: '书架记录已删除；OPFS 中的书籍副本仍保留在浏览器内。',
    };
  }
  if (webKind === 'browser-cache') {
    return {
      title: '已从书架删除',
      description: '书架记录已删除；浏览器缓存中的书籍数据仍保留。',
    };
  }
  return {
    title: '已从书架删除',
    description: '本地文件已保留。',
  };
}
