/**
 * 媒体分组类型定义（目标：reader_book_groups / audio_groups / shell_favorites）
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
  /** 音频歌单描述（audio_groups.description） */
  description?: string;
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
  /** 试听列表（播放过且未加入其它列表） */
  MusicTrial: -23,
  MusicUserStart: -1000,
  /**
   * @deprecated v120 起观看历史写入 video_play_record，不再使用该分组
   */
  VideoRecent: -30,
  /**
   * @deprecated v120 起收藏为 tracks.library + 系统分组，不再使用该分组
   */
  VideoKeep: -31,
  /** 影视系统分组：全部 */
  VideoAll: -40,
  /** 影视系统分组：点播 */
  VideoVod: -41,
  /** 影视系统分组：直播 */
  VideoLive: -42,
  /** 影视系统分组：本地 */
  VideoLocal: -43,
  VideoUserStart: -2000,
} as const;

/** 影视系统分组（虚拟过滤 library 片单） */
export const VIDEO_SYSTEM_GROUP_IDS = [
  MediaGroupId.VideoAll,
  MediaGroupId.VideoVod,
  MediaGroupId.VideoLive,
  MediaGroupId.VideoLocal,
] as const;

export function isVideoSystemGroupId(groupId: number): boolean {
  return (VIDEO_SYSTEM_GROUP_IDS as readonly number[]).includes(groupId);
}

/** @deprecated 使用 MediaGroupId */
export const BookGroupId = MediaGroupId;
