import type { Danmuku } from 'artplayer-plugin-danmuku';

/** 章节级扩展（字幕 / 预览图 / 弹幕），由书源正文或后续元数据注入 */
export interface VideoPlaybackExtras {
  subtitleUrl?: string;
  subtitleType?: 'vtt' | 'srt' | 'ass';
  vttThumbnailUrl?: string;
  danmuku?: Danmuku;
  poster?: string;
}

export interface CreateReaderArtplayerOptions {
  container: HTMLDivElement;
  url: string;
  autoplay?: boolean;
  playbackRate?: number;
  extras?: VideoPlaybackExtras;
}
