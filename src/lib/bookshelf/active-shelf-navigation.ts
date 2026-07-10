/**
 * 当前媒体 Tab 对应的书架 scoped 导航
 */

import { getScopedBookshelfStore } from '@/stores/scoped-bookshelf';
import { mediaKindTabValue, audioMediaSubTabValue } from '@/stores/shell-tabs';

export function resolveShelfScope(): string {
  const tab = mediaKindTabValue();
  if (tab === 'image') return 'image';
  if (tab === 'video') return 'video';
  if (tab === 'audio') {
    return audioMediaSubTabValue() === 'audiobook' ? 'audiobook' : 'text';
  }
  return 'text';
}

export function getActiveShelfNavigation() {
  return getScopedBookshelfStore(resolveShelfScope());
}
