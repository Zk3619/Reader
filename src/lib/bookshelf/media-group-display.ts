/**
 * 媒体分组显示名（含 Preview 按 Tab 动态文案）
 */

import type { MediaKind } from '@/lib/book-source/book-type';
import type { BookGroup } from '@/types';
import { MediaGroupId } from '@/types/book-group';

/** Preview 分组在当前媒体 Tab 下的显示文案 */
export function getPreviewGroupLabel(mediaKind?: MediaKind): string {
  switch (mediaKind) {
    case 'audio':
      return '试听';
    case 'video':
    case 'image':
      return '试看';
    case 'text':
    case 'file':
    default:
      return '试读';
  }
}

/** 解析分组在书架/分组页应展示的名称 */
export function resolveGroupDisplayName(
  group: BookGroup,
  mediaKind?: MediaKind,
): string {
  if (group.groupId === MediaGroupId.Preview) {
    return getPreviewGroupLabel(mediaKind);
  }
  return group.groupName;
}
