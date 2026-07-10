/**
 * 媒体分组类型（MediaBox 统一模型）
 */

export type { MediaGroupDomain } from '@/types/book-group';
export { MediaGroupId, BookGroupId } from '@/types/book-group';

import type { BookGroup as _BookGroup, MediaGroupDomain } from '@/types/book-group';

/** 媒体分组实体 */
export interface MediaGroup {
  groupId: number;
  groupName: string;
  cover?: string;
  order: number;
  enableRefresh: boolean;
  show: boolean;
  bookSort: number;
  onlyUpdateRead: boolean;
  domain?: MediaGroupDomain;
  listId?: string;
  source?: string;
}

/** @deprecated 使用 MediaGroup */
export type BookGroup = MediaGroup;
