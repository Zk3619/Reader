/**
 * 媒体阅读器加载提示（对齐 Legado ReadManga.loadFail 文案）
 */

import type { MediaKind } from '@/lib/book-source/book-type';

export const ReaderMediaMessages = {
  loadFailed: '加载内容失败',
  emptyContent: '正文内容为空',
  noImages: '正文没有图片',
  noAudio: '本章未解析到播放地址',
  noVideo: '本章未解析到播放地址',
  noFile: '本章未解析到文件地址',
} as const;

/** 媒体阅读器无目标媒体但有文本时，回退 text-viewer（对齐 Legado ReadBookActivity） */
export const READER_MEDIA_TEXT_FALLBACK_EVENT = 'reader:media-text-fallback';

export type ReaderMediaTextFallbackDetail = {
  bookUrl: string;
  chapterIndex: number;
  fromKind: MediaKind;
};

export function dispatchMediaTextFallback(detail: ReaderMediaTextFallbackDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(READER_MEDIA_TEXT_FALLBACK_EVENT, { detail }));
}