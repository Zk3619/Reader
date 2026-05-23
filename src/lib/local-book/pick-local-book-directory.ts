/**
 * 选择目录并收集可导入的本地书籍
 */

import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { collectLocalBooksFromDirectory } from '@/lib/local-book/scan-local-book-directory';
import type { LocalBookPickResult } from '@/lib/local-book/import';

export async function pickLocalBookDirectory(): Promise<LocalBookPickResult[] | null> {
  try {
    const picked = await pickDirectory();
    return collectLocalBooksFromDirectory(picked.ref);
  } catch (e) {
    if (isUserCancelled(e)) return null;
    throw e;
  }
}
