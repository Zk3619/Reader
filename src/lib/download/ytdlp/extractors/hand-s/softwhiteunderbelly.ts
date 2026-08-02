/** SoftWhiteUnderbellyIE — ported from yt-dlp softwhiteunderbelly.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, smuggle_url, update_url_query } from '../../utils';
import { urlencodePostdata } from './_helpers';

const LOGIN_URL = 'https://www.softwhiteunderbelly.com/login';

export class SoftWhiteUnderbellyIE extends InfoExtractor {
  static IE_NAME = 'softwhiteunderbelly';
  static _NETRC_MACHINE = 'softwhiteunderbelly';
  static _VALID_URL = /https?:\/\/(?:www\.)?softwhiteunderbelly\.com\/videos\/(?<id>[\w-]+)/;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const signinPage = await this._download_webpage(LOGIN_URL, undefined, 'Fetching authenticity token');
    const token = this._html_search_regex(
      /name=["']authenticity_token["']\s+value=["']([^"']+)/,
      signinPage,
      'authenticity_token',
    )!;
    await this._request_webpage(
      {
        url: LOGIN_URL,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: urlencodePostdata({ email: username, password, authenticity_token: token, utf8: 'true' }),
      },
      undefined,
      'Logging in',
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    if (webpage.includes('<div id="watch-unauthorized"')) {
      const cookies = await this._get_cookies('https://www.softwhiteunderbelly.com');
      if (cookies._session) {
        throw new ExtractorError('This account is not subscribed to this content', { expected: true });
      }
      this.raise_login_required();
    }
    const embedUrl = this._html_search_regex(
      /embed_url:\s*["'](?<url>https?:\/\/embed\.vhx\.tv\/videos\/(?<id>\d+)[^"']*)/,
      webpage,
      'embed url',
      null,
      false,
      'url',
    )!;
    const embedId = this._html_search_regex(
      /embed_url:\s*["']https?:\/\/embed\.vhx\.tv\/videos\/(?<id>\d+)/,
      webpage,
      'embed id',
      null,
      false,
      'id',
    )!;
    const titleMatch = webpage.match(/id=["']watch-info["'][\s\S]*?class=["'][^"']*video-title[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const title = titleMatch ? clean_html(titleMatch[1]!) : undefined;
    const thumb = this._og_search_thumbnail(webpage);
    return {
      ...this.url_result(
        smuggle_url(embedUrl, { referer: 'https://www.softwhiteunderbelly.com/' }),
        'VHXEmbed',
        embedId,
      ),
      display_id: displayId,
      title,
      description: this._html_search_meta('description', webpage) || undefined,
      thumbnail: thumb ? update_url_query(thumb, {}) : undefined,
    };
  }
}
