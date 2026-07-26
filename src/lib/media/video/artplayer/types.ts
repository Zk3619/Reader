import type { Danmuku } from 'artplayer-plugin-danmuku';

/** 章节级扩展（字幕 / 预览图 / 弹幕），由书源正文或后续元数据注入 */
export interface VideoPlaybackExtras {
  subtitleUrl?: string;
  subtitleType?: 'vtt' | 'srt' | 'ass';
  /**
   * artplayer-plugin-vtt-thumbnail 用的 WebVTT 地址（须可 fetch）。
   * 插件不会从视频抽帧：要么片源/CDN 提供预览 VTT（+ 精灵图），要么本地预先生成好再喂 URL/blob。
   */
  vttThumbnailUrl?: string;
  danmuku?: Danmuku;
  poster?: string;
  /** 弹幕插件覆盖（来自全局 danmaku-prefs） */
  danmakuOpts?: {
    opacity?: number;
    fontSize?: number;
    speed?: number;
    antiOverlap?: boolean;
    margin?: [`${number}%`, `${number}%`];
    modes?: Array<0 | 1 | 2>;
    /** 是否显示弹幕发射器（允许发送） */
    emitter?: boolean;
  };
  /** ClearKey 等（桌面尽力而为） */
  drm?: { key?: string; type?: string };
}

export interface CreateReaderArtplayerOptions {
  container: HTMLDivElement;
  url: string;
  autoplay?: boolean;
  playbackRate?: number;
  extras?: VideoPlaybackExtras;
  /** 播放请求头（Referer / Cookie 等），供 HLS/FLV/DASH 与直链 fetch 使用 */
  headers?: Record<string, string>;
  /** 显式流类型（探测结果优先于 URL 推断） */
  streamType?: import('@/lib/media/video/artplayer/detect-stream-type').ArtplayerStreamType;
  /** 直播流：HLS/FLV 使用 live 模式 */
  isLive?: boolean;
  /** 跨模块互斥：阅读器视频 / 影视 */
  playbackOwner?: 'video' | 'tv';
}
