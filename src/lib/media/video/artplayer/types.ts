import type { Danmuku } from 'artplayer-plugin-danmuku';

/** 章节级扩展（字幕 / 预览图 / 弹幕），由书源正文或后续元数据注入 */
export interface VideoPlaybackExtras {
  subtitleUrl?: string;
  subtitleType?: 'vtt' | 'srt' | 'ass';
  vttThumbnailUrl?: string;
  danmuku?: Danmuku;
  poster?: string;
  /** 弹幕插件覆盖（来自 tv-play-prefs） */
  danmakuOpts?: {
    opacity?: number;
    fontSize?: number;
    speed?: number;
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
}
