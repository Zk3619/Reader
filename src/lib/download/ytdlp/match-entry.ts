/**
 * _match_entry — yt-dlp YoutubeDL._match_entry subset.
 */

import type { VideoInfo, YoutubeDLOptions } from './types';
import { resolveDateRange } from './utils/daterange';
import type { DownloadArchive } from './archive';

export type MatchFilterFn = (
  info: VideoInfo,
  incomplete?: boolean,
) => string | null | undefined;

/** Numeric / string match_filter expression (existing Reader subset). */
export function evaluateMatchFilterSpec(
  spec: string,
  info: VideoInfo,
): string | null {
  for (const part of spec.split('&')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const num = /^\s*([a-z_]+)\s*(<=|>=|<|>|=)\s*(\d+)\s*$/i.exec(trimmed);
    if (num) {
      const key = num[1]!.toLowerCase();
      const op = num[2]!;
      const want = Number(num[3]);
      const got = Number((info as Record<string, unknown>)[key] ?? NaN);
      if (Number.isNaN(got)) return `${key} is missing (match_filter ${spec})`;
      const ok =
        op === '>'
          ? got > want
          : op === '>='
            ? got >= want
            : op === '<'
              ? got < want
              : op === '<='
                ? got <= want
                : got === want;
      if (!ok) return `${key} ${got} does not match ${op}${want}`;
      continue;
    }
    const str = /^\s*([a-z_]+)\s*(\*=|!=|=)\s*(.+?)\s*$/i.exec(trimmed);
    if (str) {
      const key = str[1]!.toLowerCase();
      const op = str[2]!;
      const want = str[3]!;
      const got = String((info as Record<string, unknown>)[key] ?? '');
      const ok =
        op === '*='
          ? got.toLowerCase().includes(want.toLowerCase())
          : op === '!='
            ? got !== want
            : got === want;
      if (!ok) return `${key} "${got}" does not match ${op}${want}`;
    }
  }
  return null;
}

export function matchFilterReject(
  info: VideoInfo,
  options: YoutubeDLOptions,
  incomplete = false,
): string | null {
  const mf = options.match_filter;
  if (!mf) return null;
  if (typeof mf === 'function') {
    try {
      const msg = (mf as MatchFilterFn)(info, incomplete);
      return msg ? String(msg) : null;
    } catch {
      if (incomplete) return null;
      const msg = (mf as (info: VideoInfo) => string | null | undefined)(info);
      return msg ? String(msg) : null;
    }
  }
  if (incomplete) return null;
  return evaluateMatchFilterSpec(String(mf).trim(), info);
}

/**
 * Returns rejection reason string, or null if OK to proceed.
 * Also returns which break option applies (existing vs reject).
 */
export function matchEntry(
  info: VideoInfo,
  options: YoutubeDLOptions,
  archive: DownloadArchive,
  incomplete = false,
): { reason: string | null; breakOpt: 'break_on_existing' | 'break_on_reject' } {
  const title = String(info.title || info.id || 'entry');
  const type = info._type || 'video';

  if (archive.has(info)) {
    return {
      reason: `${info.id || title} has already been recorded in the archive`,
      breakOpt: 'break_on_existing',
    };
  }

  if (type === 'playlist' || type === 'multi_video') {
    return { reason: null, breakOpt: 'break_on_reject' };
  }

  if (info.title) {
    const matchtitle = options.matchtitle;
    if (matchtitle) {
      try {
        if (!new RegExp(String(matchtitle), 'i').test(String(info.title))) {
          return {
            reason: `"${info.title}" title did not match pattern "${matchtitle}"`,
            breakOpt: 'break_on_reject',
          };
        }
      } catch {
        /* invalid regex — skip */
      }
    }
    const rejecttitle = options.rejecttitle;
    if (rejecttitle) {
      try {
        if (new RegExp(String(rejecttitle), 'i').test(String(info.title))) {
          return {
            reason: `"${info.title}" title matched reject pattern "${rejecttitle}"`,
            breakOpt: 'break_on_reject',
          };
        }
      } catch {
        /* invalid regex */
      }
    }
  }

  const uploadDate = info.upload_date;
  if (uploadDate) {
    const range = resolveDateRange(options.daterange);
    if (range && !range.contains(String(uploadDate))) {
      return {
        reason: `${uploadDate} upload date is not in range ${range}`,
        breakOpt: 'break_on_reject',
      };
    }
  }

  const viewCount = info.view_count;
  if (viewCount != null) {
    const minViews = options.min_views;
    if (minViews != null && viewCount < Number(minViews)) {
      return {
        reason: `Skipping ${title}, because it has not reached minimum view count (${viewCount}/${minViews})`,
        breakOpt: 'break_on_reject',
      };
    }
    const maxViews = options.max_views;
    if (maxViews != null && viewCount > Number(maxViews)) {
      return {
        reason: `Skipping ${title}, because it has exceeded the maximum view count (${viewCount}/${maxViews})`,
        breakOpt: 'break_on_reject',
      };
    }
  }

  const ageLimit = options.age_limit;
  if (
    typeof ageLimit === 'number' &&
    typeof info.age_limit === 'number' &&
    info.age_limit > ageLimit
  ) {
    return {
      reason: `Skipping "${title}" because it is age restricted`,
      breakOpt: 'break_on_reject',
    };
  }

  const filterReason = matchFilterReject(info, options, incomplete);
  if (filterReason) {
    return { reason: filterReason, breakOpt: 'break_on_reject' };
  }

  return { reason: null, breakOpt: 'break_on_reject' };
}
