/**
 * Download range helpers — yt-dlp download_ranges callback product.
 */

import type { VideoInfo, YoutubeDLOptions } from './types';

export interface DownloadRangeChapter {
  start_time?: number;
  end_time?: number;
  title?: string;
  index?: number;
}

export type DownloadRangesFn = (
  info: VideoInfo,
  ydl: unknown,
) => Iterable<DownloadRangeChapter> | DownloadRangeChapter[];

/** Resolve ranges: callback | chapter list | default [{}] (full video). */
export function resolveDownloadRanges(
  info: VideoInfo,
  options: YoutubeDLOptions,
  ydl: unknown,
): DownloadRangeChapter[] {
  const raw = options.download_ranges;
  if (raw == null) return [{}];
  if (typeof raw === 'function') {
    try {
      return [...(raw as DownloadRangesFn)(info, ydl)];
    } catch {
      return [{}];
    }
  }
  if (Array.isArray(raw)) {
    return raw.length ? (raw as DownloadRangeChapter[]) : [{}];
  }
  return [{}];
}

/** Apply section_* fields onto a copy of info for one format × range. */
export function applyRangeToInfo(
  info: VideoInfo,
  chapter: DownloadRangeChapter,
): VideoInfo {
  if (!chapter || (chapter.start_time == null && chapter.end_time == null && !chapter.title)) {
    return { ...info };
  }
  const offset = Number(info.section_start) || 0;
  const duration = Number(info.duration);
  const dur = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  let endTime = offset + Math.min(chapter.end_time ?? dur, dur);
  if (!Number.isFinite(endTime) || endTime > offset + dur + 1) {
    endTime = Number.NaN;
  }
  return {
    ...info,
    section_start: offset + (chapter.start_time ?? 0),
    section_end: Number.isFinite(endTime) ? endTime : undefined,
    section_title: chapter.title,
    section_number: chapter.index,
    force_keyframes_at_cuts: !!(info as VideoInfo & { force_keyframes_at_cuts?: boolean })
      .force_keyframes_at_cuts,
  };
}
