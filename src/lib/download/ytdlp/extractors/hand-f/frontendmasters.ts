/**
 * FrontendMasters* ??ported from yt-dlp frontendmasters.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { parse_duration, url_or_none } from '../../utils';
import { hiddenInputs, urlencodePostdata } from './_helpers';

const QUALITIES: Record<string, { width: number; height: number }> = {
  low: { width: 480, height: 360 },
  mid: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
};

export class FrontendMastersBaseIE extends InfoExtractor {
  static IE_NAME = 'frontendmastersbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _API_BASE = 'https://api.frontendmasters.com/v1/kabuki';
  static _LOGIN_URL = 'https://frontendmasters.com/login/';
  static _NETRC_MACHINE = 'frontendmasters';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('FrontendMastersBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginPage = await this._download_webpage(FrontendMastersBaseIE._LOGIN_URL, undefined, 'Downloading login page');
    const loginForm = hiddenInputs(loginPage);
    loginForm.username = username;
    loginForm.password = password;
    const postUrl =
      this._search_regex(/<form[^>]+action=(["'])(?<url>.+?)\1/, loginPage, 'post_url', 'url', false) ||
      FrontendMastersBaseIE._LOGIN_URL;
    const absolutePost = postUrl.startsWith('http')
      ? postUrl
      : new URL(postUrl, FrontendMastersBaseIE._LOGIN_URL).toString();
    const response = await this._download_webpage(absolutePost, undefined, 'Logging in', {
      data: urlencodePostdata(loginForm),
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    } as never);
    if (/wp-login\.php\?action=logout|>Logout/.test(response)) return;
    const error = this._html_search_regex(
      /class=(["'])(?:(?!\1).)*\bMessageAlert\b(?:(?!\1).)*\1[^>]*>(?<error>[^<]+)</,
      response,
      'error message',
      'error',
      false,
    );
    if (error) throw new ExtractorError(`Unable to login: ${error}`, { expected: true });
    throw new ExtractorError('Unable to log in', { expected: true });
  }
}

export class FrontendMastersPageBaseIE extends FrontendMastersBaseIE {
  static IE_NAME = 'frontendmasterspagebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('FrontendMastersPageBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _downloadCourse(courseName: string, referer: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `${FrontendMastersBaseIE._API_BASE}/courses/${courseName}`,
      courseName,
      'Downloading course JSON',
      { headers: { Referer: referer } },
    );
  }

  protected static _extractChapters(course: Record<string, unknown>): Array<string | null> {
    const lessonElements = course.lessonElements;
    if (!Array.isArray(lessonElements)) return [];
    return lessonElements.map((e) => url_or_none(e));
  }

  protected _extractLesson(
    chapters: Array<string | null>,
    lessonId: string,
    lesson: Record<string, unknown>,
  ): VideoInfo {
    const title = (lesson.title as string | undefined) || lessonId;
    const displayId = lesson.slug as string | undefined;
    const description = lesson.description as string | undefined;
    const thumbnail = lesson.thumbnail as string | undefined;
    let chapterNumber: number | null = null;
    const index = lesson.index;
    const elementIndex = lesson.elementIndex;
    if (typeof index === 'number' && typeof elementIndex === 'number' && index < elementIndex) {
      chapterNumber = elementIndex - index;
    }
    const chapter =
      chapterNumber != null && chapterNumber - 1 < chapters.length
        ? chapters[chapterNumber - 1]
        : null;

    let duration: number | undefined;
    const timestamp = lesson.timestamp;
    if (typeof timestamp === 'string') {
      const mobj = /(?<start>\d{1,2}:\d{1,2}:\d{1,2})\s*-(?<end>\s*\d{1,2}:\d{1,2}:\d{1,2})/.exec(timestamp);
      if (mobj?.groups) {
        duration =
          (parse_duration(mobj.groups.end!) ?? 0) - (parse_duration(mobj.groups.start!) ?? 0);
      }
    }

    return {
      _type: 'url_transparent',
      url: `frontendmasters:${lessonId}`,
      ie_key: 'FrontendMasters',
      id: lessonId,
      display_id: displayId,
      title,
      description,
      thumbnail,
      duration,
      chapter: chapter ?? undefined,
      chapter_number: chapterNumber ?? undefined,
    };
  }
}

export class FrontendMastersIE extends FrontendMastersBaseIE {
  static IE_NAME = 'frontendmasters';
  static _VALID_URL =
    /(?:frontendmasters:|https?:\/\/api\.frontendmasters\.com\/v\d+\/kabuki\/video\/)(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const lessonId = this._match_id(url);
    const sourceUrl = `${FrontendMastersBaseIE._API_BASE}/video/${lessonId}/source`;
    const formats: Format[] = [];

    for (const ext of ['webm', 'mp4'] as const) {
      for (const quality of ['low', 'mid', 'high'] as const) {
        const resolution = { ...QUALITIES[quality]! };
        const formatId = `${ext}-${quality}`;
        const payload = await this._download_json<{ url?: string }>(
          sourceUrl,
          lessonId,
          `Downloading ${formatId} source JSON`,
          {
            query: { f: ext, r: String(resolution.height) },
            headers: { Referer: url },
            fatal: false,
          },
        );
        if (!payload.url) continue;
        formats.push({ ...resolution, url: payload.url, ext, format_id: formatId });
      }
    }

    const subtitles: Record<string, Subtitle[]> = {
      en: [{ url: `${FrontendMastersBaseIE._API_BASE}/transcripts/${lessonId}.vtt`, ext: 'vtt' }],
    };

    return { id: lessonId, title: lessonId, formats, subtitles };
  }
}

export class FrontendMastersLessonIE extends FrontendMastersPageBaseIE {
  static IE_NAME = 'frontendmasterslesson';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?frontendmasters\.com\/courses\/(?<course_name>[^/]+)\/(?<lesson_name>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const courseName = m.groups!.course_name!;
    const lessonName = m.groups!.lesson_name!;
    const course = await this._downloadCourse(courseName, url);
    const lessonData = (course.lessonData as Record<string, Record<string, unknown>>) || {};
    let found: [string, Record<string, unknown>] | undefined;
    for (const [videoId, data] of Object.entries(lessonData)) {
      if (data.slug === lessonName) {
        found = [videoId, data];
        break;
      }
    }
    if (!found) throw new ExtractorError('Lesson not found', { expected: true });
    const chapters = FrontendMastersPageBaseIE._extractChapters(course);
    return this._extractLesson(chapters, found[0], found[1]);
  }
}

export class FrontendMastersCourseIE extends FrontendMastersPageBaseIE {
  static IE_NAME = 'frontendmasterscourse';
  static _VALID_URL = /https?:\/\/(?:www\.)?frontendmasters\.com\/courses\/(?<id>[^/]+)/;

  static suitable(url: string): boolean {
    if (FrontendMastersLessonIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseName = this._match_id(url);
    const course = await this._downloadCourse(courseName, url);
    const chapters = FrontendMastersPageBaseIE._extractChapters(course);
    const lessonData = (course.lessonData as Record<string, Record<string, unknown>>) || {};
    const lessons = Object.values(lessonData).sort(
      (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0),
    );
    const entries: VideoInfo[] = [];
    for (const lesson of lessons) {
      const lessonName = lesson.slug as string | undefined;
      const lessonId = (lesson.hash as string | undefined) || (lesson.statsId as string | undefined);
      if (!lessonId || !lessonName) continue;
      entries.push(this._extractLesson(chapters, lessonId, lesson));
    }
    return this.playlist_result(
      entries,
      courseName,
      course.title as string | undefined,
      course.description as string | undefined,
    );
  }
}
