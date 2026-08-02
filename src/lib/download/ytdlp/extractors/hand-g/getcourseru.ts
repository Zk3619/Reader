/**
 * GetCourseRuPlayerIE / GetCourseRuIE — ported from yt-dlp getcourseru.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  htmlExtractTitle,
  playlistFromMatches,
  urlencodePostdata,
} from './_helpers';

export class GetCourseRuPlayerIE extends InfoExtractor {
  static IE_NAME = 'getcourseruplayer';
  static _VALID_URL =
    /https?:\/\/(?:player02\.getcourse\.ru|cf-api-2\.vhcdn\.com)\/sign-player\/?\?(?:[^#]+&)?json=[^#&]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, undefined, 'Downloading player page');
    const windowConfigs = this._search_json<Record<string, unknown>>(/window\.configs\s*=/, webpage, 'config', undefined)!;
    const videoId = String(windowConfigs.gcFileId ?? '');
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(windowConfigs.masterPlaylistUrl ?? ''),
      videoId,
    );

    return {
      id: videoId,
      title: String(windowConfigs.videoHash ?? videoId),
      thumbnail: url_or_none(windowConfigs.previewUrl) ?? undefined,
      duration: int_or_none(windowConfigs.videoDuration) ?? undefined,
      formats,
      subtitles,
    };
  }
}

const GETCOURSE_DOMAINS = ['academymel.online', 'marafon.mani-beauty.com', 'on.psbook.ru'];
const GETCOURSE_BASE_RE = `https?:\\/\\/(?:(?!player02\\.)[a-zA-Z0-9-]+\\.getcourse\\.(?:ru|io)|${GETCOURSE_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|')})`;

export class GetCourseRuIE extends InfoExtractor {
  static IE_NAME = 'getcourseru';
  static _NETRC_MACHINE = 'getcourseru';
  static _VALID_URL = [
    new RegExp(`${GETCOURSE_BASE_RE}/(?!pl/|teach/)(?<id>[^?#]+)`),
    new RegExp(`${GETCOURSE_BASE_RE}/(?:pl/)?teach/control/lesson/view\\?(?:[^#]+&)?id=(?<id>\\d+)`),
  ];

  static _LOGIN_URL_PATH = '/cms/system/login';

  protected async _login(hostname: string, username: string, password: string): Promise<void> {
    const cookies = await this._get_cookies(`https://${hostname}`);
    if (cookies.PHPSESSID5) return;

    const loginUrl = `https://${hostname}${GetCourseRuIE._LOGIN_URL_PATH}`;
    const webpage = await this._download_webpage(loginUrl, undefined);
    await this._download_json(
      loginUrl,
      undefined,
      'Logging in',
      {
        method: 'POST',
        data: urlencodePostdata({
          action: 'processXdget',
          xdgetId: this._html_search_regex(
            /<form[^>]+\bclass="[^"]*\bstate-login[^"]*"[^>]+\bdata-xdget-id="([^"]+)"/,
            webpage,
            'xdgetId',
          )!,
          'params[action]': 'login',
          'params[url]': loginUrl,
          'params[object_type]': 'cms_page',
          'params[object_id]': '-1',
          'params[email]': username,
          'params[password]': password,
          requestTime: String(Math.floor(Date.now() / 1000)),
          requestSimpleSign: this._html_search_regex(
            /window\.requestSimpleSign\s*=\s*"([\da-f]+)"/,
            webpage,
            'simple sign',
          )!,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const hostname = new URL(url).hostname;
    const webpage = await this._download_webpage(url, this._match_id(url));
    if (webpage.includes(GetCourseRuIE._LOGIN_URL_PATH)) {
      this.raise_login_required(`This video is only available for registered users (${hostname})`);
    }

    const displayId = this._match_id(url);
    const playlistId =
      this._search_regex(/window\.(?:lessonId|gcsObjectId)\s*=\s*(\d+)/, webpage, 'playlist id', null, false, 1) ||
      displayId;
    const title = this._og_search_title(webpage) || htmlExtractTitle(webpage) || undefined;

    const embedRe =
      /<iframe[^>]+\bsrc=['"](https?:\/\/(?:player02\.getcourse\.ru|cf-api-2\.vhcdn\.com)\/sign-player\/?\?(?:[^#]+&)?json=[^#'"]*)['"]/g;
    const matches = [...webpage.matchAll(embedRe)].map((m) => m[1]!);

    return playlistFromMatches(this, matches, playlistId, {
      title,
      ie: 'GetCourseRuPlayer',
      video_kwargs: { url_transparent: true, title },
    });
  }
}
