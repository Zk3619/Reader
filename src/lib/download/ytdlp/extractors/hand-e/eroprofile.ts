/**
 * EroProfile family — ported from yt-dlp eroprofile.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { merge_dicts } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

const LOGIN_URL = 'http://www.eroprofile.com/auth/auth.php?';

export class EroProfileIE extends InfoExtractor {
  static IE_NAME = 'eroprofile';
  static _VALID_URL = /https?:\/\/(?:www\.)?eroprofile\.com\/m\/videos\/view\/(?<id>[^/]+)/;

  async _performLogin(username: string, password: string): Promise<void> {
    const query = new URLSearchParams({
      username,
      password,
      url: 'http://www.eroprofile.com/',
    }).toString();
    const loginPage = await this._download_webpage(`${LOGIN_URL}${query}`, undefined, undefined, { fatal: false });
    if (/Your username or password was incorrect\./.test(loginPage)) {
      throw new ExtractorError('Wrong username and/or password.', { expected: true });
    }
    const redirectUrl = this._search_regex(/<script[^>]+?src="([^"]+)"/, loginPage, 'login redirect url')!;
    await this._download_webpage(redirectUrl, undefined, undefined, { fatal: false });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    if (/You must be logged in to view this video\./.test(webpage)) {
      this.raise_login_required('This video requires login');
    }

    const videoId =
      this._search_regex(
        [/glbUpdViews\s*\('\d*','(\d+)'/, /p\/report\/video\/(\d+)/],
        webpage,
        'video id',
        null,
        false,
      ) || displayId;

    const title =
      this._html_search_regex(
        [/Title:<\/th><td>([^<]+)<\/td>/, /<h1[^>]*>(.+?)<\/h1>/],
        webpage,
        'title',
      ) || displayId;

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    const info = mediaEntries[0] || { formats: [], subtitles: {} };

    return merge_dicts(info, {
      id: videoId,
      display_id: displayId,
      title,
      age_limit: 18,
    }) as VideoInfo;
  }
}

export class EroProfileAlbumIE extends InfoExtractor {
  static IE_NAME = 'EroProfile:album';
  static _VALID_URL = /https?:\/\/(?:www\.)?eroprofile\.com\/m\/videos\/album\/(?<id>[^/]+)/;

  private _extractFromPage(page: string): VideoInfo[] {
    return [...page.matchAll(/href=".*?(\/m\/videos\/view\/[^"]+)"/g)].map((m) =>
      this.url_result(`https://www.eroprofile.com${m[1]!}`, 'EroProfile'),
    );
  }

  private async *_entries(playlistId: string, firstPage: string): AsyncGenerator<VideoInfo> {
    for (const entry of this._extractFromPage(firstPage)) yield entry;

    const pageUrls = [...firstPage.matchAll(new RegExp(`href=".*?(/m/videos/album/${playlistId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?pnum=(\\d+))"`, 'g'))];
    let maxPage = 1;
    for (const m of pageUrls) maxPage = Math.max(maxPage, Number(m[2]));

    for (let n = 2; n <= maxPage; n++) {
      const pageUrl = `https://www.eroprofile.com/m/videos/album/${playlistId}?pnum=${n}`;
      const page = await this._download_webpage(pageUrl, playlistId, `Downloading playlist page ${n - 1}`);
      for (const entry of this._extractFromPage(page)) yield entry;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const firstPage = await this._download_webpage(url, playlistId, 'Downloading playlist');
    const playlistTitle =
      this._search_regex(/<title>Album: (.*) - EroProfile<\/title>/, firstPage, 'playlist_title') || playlistId;

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(playlistId, firstPage)) entries.push(entry);

    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}
