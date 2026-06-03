import { isTauri } from '@/lib/platform/detect';
import { formatStorageRef, parseStorageRef } from '@/lib/platform/fs/storage-ref';
import type { AppSettings } from '@/stores/settings';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

/** 将旧版 booksDirectory / 裸路径 迁移为 booksStorageRoot */
export function migrateAppStorageSettings(app: AppSettings): AppSettings {
  let next = { ...app };

  if (!next.booksStorageRoot?.trim() && next.booksDirectory?.trim()) {
    const ref = parseStorageRef(next.booksDirectory);
    next = {
      ...next,
      booksStorageRoot: formatStorageRef(ref),
      booksDirectorySet: next.booksDirectorySet ?? true,
    };
  }

  if (!isTauri() && next.booksStorageRoot?.trim()) {
    const ref = parseStorageRef(next.booksStorageRoot);
    if (ref.kind === 'path' || ref.kind === 'uri') {
      next = {
        ...next,
        booksStorageRoot: 'opfs:books',
        booksDirectory: undefined,
      };
    }
  }

  if (next.viewerChromeLayout != null) {
    next = {
      ...next,
      viewerChromeLayout: normalizeViewerChromeLayout(next.viewerChromeLayout),
    };
  }

  return next;
}
