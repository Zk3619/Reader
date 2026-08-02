/**
 * Egghead family — ported from yt-dlp egghead.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';

export class EggheadBaseIE extends InfoExtractor {
  static IE_NAME = 'eggheadbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('EggheadBaseIE is not a standalone extractor', { expected: true });
  }

  protected _call_api(path: string, videoId: string, resource: string, fatal = true) {
    return this._download_json<unknown>(
      `https://app.egghead.io/api/v1/${path}`,
      videoId,
      `Downloading ${resource} JSON`,
      { fatal },
    );
  }
}

export class EggheadCourseIE extends EggheadBaseIE {
  static IE_DESC = 'egghead.io course';
  static IE_NAME = 'egghead:course';
  static _VALID_URL = /https?:\/\/(?:app\.)?egghead\.io\/(?:course|playlist)s\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const seriesPath = `series/${playlistId}`;
    const lessons = (await this._call_api(`${seriesPath}/lessons`, playlistId, 'course lessons')) as Record<
      string,
      unknown
    >[];

    const entries: VideoInfo[] = [];
    for (const lesson of lessons) {
      const lessonUrl = url_or_none(lesson.http_url);
      if (!lessonUrl) continue;
      const lessonId = lesson.id != null ? String(lesson.id) : undefined;
      entries.push(this.url_result(lessonUrl, 'EggheadLesson', lessonId));
    }

    const course =
      ((await this._call_api(seriesPath, playlistId, 'course', false)) as Record<string, unknown>) || {};
    const id = course.id != null ? String(course.id) : playlistId;

    return this.playlist_result(
      entries,
      id,
      (course.title as string) || undefined,
      (course.description as string) || undefined,
    );
  }
}

export class EggheadLessonIE extends EggheadBaseIE {
  static IE_DESC = 'egghead.io lesson';
  static IE_NAME = 'egghead:lesson';
  static _VALID_URL = /https?:\/\/(?:app\.)?egghead\.io\/(?:api\/v1\/)?lessons\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const lesson = (await this._call_api(`lessons/${displayId}`, displayId, 'lesson')) as Record<string, unknown>;

    const lessonId = String(lesson.id);
    const title = String(lesson.title ?? lessonId);
    const formats: Format[] = [];
    const mediaUrls = (lesson.media_urls as Record<string, unknown>) || {};

    for (const formatUrlRaw of Object.values(mediaUrls)) {
      const formatUrl = url_or_none(formatUrlRaw);
      if (!formatUrl) continue;
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(formatUrl, lessonId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(formatUrl, lessonId, 'dash', undefined, false)));
      } else {
        formats.push({ format_id: ext || 'http', url: formatUrl });
      }
    }

    return {
      id: lessonId,
      display_id: displayId,
      title,
      description: (lesson.summary as string) || undefined,
      thumbnail: (lesson.thumb_nail as string) || undefined,
      timestamp: unified_timestamp(lesson.published_at) ?? undefined,
      duration: int_or_none(lesson.duration) ?? undefined,
      view_count: int_or_none(lesson.plays_count) ?? undefined,
      tags: (try_get(lesson, [(x) => x.tag_list as unknown[]], Array.isArray) as string[] | undefined) || undefined,
      series: try_get(lesson, [(x) => (x.series as Record<string, unknown>)?.title as string], (v) => typeof v === 'string') || undefined,
      formats,
    };
  }
}
