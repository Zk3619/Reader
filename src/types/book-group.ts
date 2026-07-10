/**
 * 媒体分组类型定义（原 book_groups，迁移为 media_groups）
 */

export type MediaGroupDomain = 'shelf' | 'music' | 'shared';

/**
 * 分组实体
 */
export interface BookGroup {
  groupId: number;
  groupName: string;
  cover?: string;
  order: number;
  enableRefresh: boolean;
  show: boolean;
  bookSort: number;
  onlyUpdateRead: boolean;
  /** v104+ 分组域 */
  domain?: MediaGroupDomain;
  /** 音乐列表 ID（domain=music） */
  listId?: string;
  /** 音乐列表来源 */
  source?: string;
}

/** 媒体分组实体（新名称） */
export type MediaGroup = BookGroup;

export const MediaGroupId = {
  Root: -100,
  All: -1,
  Local: -2,
  /** @deprecated 已移除，仅备份解析 */
  Audio: -3,
  NetNone: -4,
  LocalNone: -5,
  /** @deprecated 已移除，仅备份解析 */
  Video: -6,
  Favorite: -7,
  Preview: -8,
  Error: -11,
  MusicDefault: -20,
  MusicRecent: -21,
  MusicLocal: -22,
  MusicUserStart: -1000,
} as const;

/** @deprecated 使用 MediaGroupId */
export const BookGroupId = MediaGroupId;
