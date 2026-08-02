/** PluralsightBaseIE / PluralsightIE / PluralsightCourseIE — ported from yt-dlp pluralsight.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  parse_qs,
  str_or_none,
  try_get,
} from '../../utils';
import { hiddenInputs, qualityRank, urlencodePostdata } from './_helpers';

const GRAPHQL_COURSE_TMPL = `
query BootstrapPlayer {
  rpc { bootstrapPlayer {
    course(courseId: "%s") {
      name title courseHasCaptions supportsWideScreenVideoFormats
      modules { name moduleName clips { clipId clipIndex index moduleIndex moduleTitle name title duration formattedDuration clipName } }
    }
  }}
}`;

const GRAPHQL_VIEWCLIP_TMPL = `
query viewClip {
  viewClip(input: {
    author: "%(author)s", clipIndex: %(clipIndex)d, courseName: "%(courseName)s",
    includeCaptions: false, locale: "en", mediaType: "%(mediaType)s",
    moduleName: "%(moduleName)s", quality: "%(quality)s"
  }) { urls { url cdn rank } status }
}`;

const QUALITIES: Record<string, { width: number; height: number }> = {
  low: { width: 640, height: 480 },
  medium: { width: 848, height: 640 },
  high: { width: 1024, height: 768 },
  'high-widescreen': { width: 1280, height: 720 },
};

export class PluralsightBaseIE extends InfoExtractor {
  static IE_NAME = 'pluralsightbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_BASE = 'https://app.pluralsight.com';
  static _GRAPHQL_EP = 'https://app.pluralsight.com/player/api/graphql';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PluralsightBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _downloadCourse(courseId: string, url: string, displayId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this._download_json<{ data?: { rpc?: { bootstrapPlayer?: { course?: Record<string, unknown> } } } }>(
        PluralsightBaseIE._GRAPHQL_EP,
        displayId,
        undefined,
        {
          method: 'POST',
          data: JSON.stringify({ query: GRAPHQL_COURSE_TMPL.replace('%s', courseId), variables: {} }),
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        },
      );
      const course = try_get(response, (x) => x.data?.rpc?.bootstrapPlayer?.course) as Record<string, unknown> | undefined;
      if (course) return course;
      throw new ExtractorError('GraphQL course fetch failed', { expected: true });
    } catch {
      return (
        await this._download_json<Record<string, unknown>>(
          'https://app.pluralsight.com/player/user/api/v1/player/payload',
          displayId,
          undefined,
          {
            method: 'POST',
        headers: { Referer: url },
        data: urlencodePostdata({ courseId }),
          },
        )
      );
    }
  }
}

export class PluralsightIE extends PluralsightBaseIE {
  static IE_NAME = 'pluralsight';
  static _VALID_URL = /https?:\/\/(?:(?:www|app)\.)?pluralsight\.com\/(?:training\/)?player\?/;
  static _LOGIN_URL = 'https://app.pluralsight.com/id/';
  static _NETRC_MACHINE = 'pluralsight';

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginPage = await this._download_webpage(PluralsightIE._LOGIN_URL, undefined, 'Downloading login page');
    const loginForm = hiddenInputs(loginPage);
    loginForm.Username = username;
    loginForm.Password = password;
    const postUrl =
      this._search_regex(/<form[^>]+action=(["'])(?<url>.+?)\1/, loginPage, 'post url', 'url', false) ||
      PluralsightIE._LOGIN_URL;
    const postUrlFull = postUrl.startsWith('http') ? postUrl : new URL(postUrl, PluralsightIE._LOGIN_URL).toString();
    const response = await this._httpGetText(
      postUrlFull,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      { method: 'POST', body: urlencodePostdata(loginForm) },
    );
    const error = this._search_regex(
      /<span[^>]+class="field-validation-error"[^>]*>([^<]+)<\/span>/,
      response,
      'error message',
      null,
      false,
    );
    if (error) throw new ExtractorError(`Unable to login: ${error}`, { expected: true });
    if (!/__INITIAL_STATE__|currentUser|>\s*Sign out\s*</i.test(response)) {
      throw new ExtractorError('Unable to log in', { expected: true });
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const author = qs.author?.[0];
    const name = qs.name?.[0];
    const clipIdx = qs.clip?.[0];
    const courseName = qs.course?.[0];
    if (!author || !name || !clipIdx || !courseName) {
      throw new ExtractorError('Invalid URL', { expected: true });
    }

    const displayId = `${name}-${clipIdx}`;
    const course = await this._downloadCourse(courseName, url, displayId);
    const modules = (course.modules as Array<Record<string, unknown>>) || [];

    let clip: Record<string, unknown> | undefined;
    for (const mod of modules) {
      if (name !== mod.moduleName && name !== mod.name) continue;
      for (const c of (mod.clips as Array<Record<string, unknown>>) || []) {
        const idx = c.clipIndex ?? c.index;
        if (String(idx) === clipIdx) {
          clip = c;
          break;
        }
      }
    }
    if (!clip) throw new ExtractorError('Unable to resolve clip', { expected: true });

    const widescreen = course.supportsWideScreenVideoFormats === true;
    const bestQuality = widescreen ? 'high-widescreen' : 'high';
    const qualityKey = qualityRank(['low', 'medium', 'high', 'high-widescreen']);
    const ext = this.params.prefer_free_formats ? 'webm' : 'mp4';
    const quality = bestQuality;
    const dims = QUALITIES[quality]!;
    const clipPost = {
      author,
      includeCaptions: 'false',
      clipIndex: Number(clipIdx),
      courseName,
      locale: 'en',
      mediaType: ext,
      moduleName: name,
      quality: `${dims.width}x${dims.height}`,
    };

    let viewclip: Record<string, unknown> | undefined;
    try {
      viewclip = (
        await this._download_json<{ data?: { viewClip?: Record<string, unknown> } }>(
          PluralsightBaseIE._GRAPHQL_EP,
          displayId,
          undefined,
          {
            method: 'POST',
            data: JSON.stringify({
              query: GRAPHQL_VIEWCLIP_TMPL.replace('%(author)s', author)
                .replace('%(clipIndex)d', String(clipPost.clipIndex))
                .replace('%(courseName)s', courseName)
                .replace('%(mediaType)s', ext)
                .replace('%(moduleName)s', name)
                .replace('%(quality)s', clipPost.quality),
              variables: {},
            }),
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          },
        )
      ).data?.viewClip;
    } catch {
      viewclip = await this._download_json<Record<string, unknown>>(
        `${PluralsightBaseIE._API_BASE}/video/clips/viewclip`,
        displayId,
        undefined,
        {
          method: 'POST',
          data: JSON.stringify(clipPost),
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          fatal: false,
        },
      );
    }

    const formats: Format[] = [];
    for (const clipUrlData of (viewclip?.urls as Array<Record<string, unknown>>) || []) {
      const clipUrl = str_or_none(clipUrlData.url);
      if (!clipUrl) continue;
      const cdn = str_or_none(clipUrlData.cdn);
      formats.push({
        ...dims,
        url: clipUrl,
        ext,
        format_id: cdn ? `${ext}-${quality}-${cdn}` : `${ext}-${quality}`,
        quality: qualityKey(quality),
        source_preference: int_or_none(clipUrlData.rank) ?? undefined,
      });
    }

    const duration = int_or_none(clip.duration) || parse_duration(String(clip.formattedDuration ?? '')) || undefined;
    const clipId = str_or_none(clip.clipName) || str_or_none(clip.name) || String(clip.clipId ?? displayId);

    return {
      id: clipId,
      title: String(clip.title ?? ''),
      duration,
      creator: author,
      formats,
    };
  }
}

export class PluralsightCourseIE extends PluralsightBaseIE {
  static IE_NAME = 'pluralsight:course';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|app)\.)?pluralsight\.com\/(?:library\/)?courses\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseId = this._match_id(url);
    const course = await this._downloadCourse(courseId, url, courseId);
    const entries: VideoInfo[] = [];
    for (const mod of (course.modules as Array<Record<string, unknown>>) || []) {
      const moduleName = str_or_none(mod.moduleName) || str_or_none(mod.name) || '';
      const author = str_or_none(course.name) || '';
      for (const clip of (mod.clips as Array<Record<string, unknown>>) || []) {
        const clipIndex = clip.clipIndex ?? clip.index;
        if (clipIndex == null) continue;
        const clipName = str_or_none(clip.clipName) || str_or_none(clip.name) || '';
        entries.push(
          this.url_result(
            `${PluralsightBaseIE._API_BASE}/training/player?course=${courseId}&author=${author}&name=${moduleName}&clip=${clipIndex}`,
            'Pluralsight',
            clipName || `${courseId}-${clipIndex}`,
            str_or_none(clip.title) ?? undefined,
          ),
        );
      }
    }
    return this.playlist_result(entries, courseId, str_or_none(course.title) ?? undefined, str_or_none(course.description) ?? undefined);
  }
}
