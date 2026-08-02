/**
 * GermanupaIE — ported from yt-dlp germanupa.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs, smuggle_url, traverse_obj, url_or_none } from '../../utils';

export class GermanupaIE extends InfoExtractor {
  static IE_DESC = 'germanupa.de';
  static IE_NAME = 'germanupa';
  static _VALID_URL = /https?:\/\/germanupa\.de\/mediathek\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const embedMatch = this._search_regex(
      /<iframe[^>]+data-src\s*?=\s*?([\'"])(?<url>https:\/\/germanupa\.de\/media\/oembed\?url=(?:(?!\1).)+)\1/,
      webpage,
      'embedded video',
      null,
      false,
      'url',
    );
    const paramUrl = url_or_none(
      traverse_obj(parse_qs(embedMatch || ''), ['url', 0]) as string | undefined,
    );

    if (!paramUrl) {
      if (
        this._search_regex(
          /<div[^>]+class\s*?=\s*?([\'"])(?:(?!\1).)*login-wrapper(?:(?!\1).)*\1/,
          webpage,
          'login wrapper',
          null,
          false,
        )
      ) {
        this.raise_login_required('This video is only available for members');
      }
      return this.url_result(url, 'Generic');
    }

    const realUrl = paramUrl.replace('https://vimeo.com/', 'https://player.vimeo.com/video/');
    return this.url_result(smuggle_url(realUrl, { referer: url }), 'Vimeo', videoId);
  }
}
