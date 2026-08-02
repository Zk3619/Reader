/**
 * BrilliantpalaIE family — ported from yt-dlp brilliantpala.py
 * NOTE: the login/cookie flow from upstream is not portable to this runtime;
 * we attempt anonymous content access and surface a login-required error
 * when the username cannot be recovered from the page.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class BrilliantpalaBaseIE extends InfoExtractor {
  static IE_NAME = 'brilliantpalabase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'brilliantpala';
  protected static _DOMAIN = '{subdomain}.brilliantpala.org';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BrilliantpalaBaseIE is not a standalone extractor', { expected: true });
  }

  protected get _domain(): string {
    return (this.constructor as typeof BrilliantpalaBaseIE)._DOMAIN;
  }

  protected async _getLoggedInUsername(url: string, videoId: string): Promise<string> {
    const webpage = await this._download_webpage(url, videoId);
    const username = this._search_regex(
      /"username"\s*:\s*"(?<username>[^"]+)"/,
      webpage,
      'logged-in username',
      null,
      false,
      'username',
    );
    if (!username) this.raise_login_required();
    return username;
  }

  protected async _extractCourseContent(url: string, courseId: string, contentId: string): Promise<VideoInfo> {
    const videoId = `${courseId}-${contentId}`;
    const username = await this._getLoggedInUsername(url, videoId);

    const contentJson = await this._download_json<Record<string, unknown>>(
      `https://${this._domain}/api/v2.4/contents/${contentId}/`,
      videoId,
      'Fetching content info',
    );

    const streams = (traverse_obj(contentJson, ['video', 'streams']) as Array<Record<string, unknown>>) || [];
    const keyHash = await sha256Hex(username);

    const entries: VideoInfo[] = [];
    for (const stream of streams) {
      if (!stream?.id || !stream?.url) continue;
      const formats = await this._extract_m3u8_formats(
        String(stream.url),
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        undefined,
        undefined,
        false,
      );
      if (!formats.length) continue;
      entries.push({
        id: String(stream.id),
        title: (contentJson.title as string) || undefined,
        formats,
        http_headers: { 'X-Key': keyHash },
        thumbnail: (contentJson.cover_image as string) || undefined,
      });
    }

    return this.playlist_result(entries, videoId, (contentJson.title as string) || undefined);
  }
}

export class BrilliantpalaElearnIE extends BrilliantpalaBaseIE {
  static IE_NAME = 'Brilliantpala:Elearn';
  static IE_DESC = 'VoD on elearn.brilliantpala.org';
  static _VALID_URL = /https?:\/\/elearn\.brilliantpala\.org\/courses\/(?<course_id>\d+)\/contents\/(?<content_id>\d+)\/?/;
  protected static _DOMAIN = 'elearn.brilliantpala.org';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    return this._extractCourseContent(url, m.groups!.course_id!, m.groups!.content_id!);
  }
}

export class BrilliantpalaClassesIE extends BrilliantpalaBaseIE {
  static IE_NAME = 'Brilliantpala:Classes';
  static IE_DESC = 'VoD on classes.brilliantpala.org';
  static _VALID_URL = /https?:\/\/classes\.brilliantpala\.org\/courses\/(?<course_id>\d+)\/contents\/(?<content_id>\d+)\/?/;
  protected static _DOMAIN = 'classes.brilliantpala.org';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    return this._extractCourseContent(url, m.groups!.course_id!, m.groups!.content_id!);
  }
}
