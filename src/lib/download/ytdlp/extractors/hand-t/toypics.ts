/** ToypicsIE / ToypicsUserIE — ported from yt-dlp toypics.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseHtml5MediaEntries } from './_helpers';

export class ToypicsIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/videos\.toypics\.net\/view\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    const formats = mediaEntries[0]?.formats || [];

    const title =
      this._html_search_regex(
        [
          /<h1[^>]+class=["']view-video-title[^>]+>([^<]+)</,
          /<title>([^<]+) - Toypics<\/title>/,
        ],
        webpage,
        'title',
      ) || videoId;

    const uploader = this._html_search_regex(
      /More videos from <strong>([^<]+)<\/strong>/,
      webpage,
      'uploader',
      null,
      false,
    );

    return {
      id: videoId,
      formats,
      title,
      uploader: uploader || undefined,
      age_limit: 18,
    };
  }
}

export class ToypicsUserIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/videos\.toypics\.net\/(?!view)(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const username = this._match_id(url);
    const profilePage = await this._download_webpage(url, username, 'Retrieving profile page');

    const videoCount = parseInt(
      this._search_regex(
        /public\/">Public Videos \(([0-9]+)\)<\/a><\/li>/,
        profilePage,
        'video count',
        '0',
      ) || '0',
      10,
    );

    const PAGE_SIZE = 8;
    const urls: string[] = [];
    const pageCount = Math.floor((videoCount + PAGE_SIZE + 1) / PAGE_SIZE);
    for (let n = 1; n <= pageCount; n++) {
      const lpageUrl = `${url.replace(/\/$/, '')}/public/${n}`;
      const lpage = await this._download_webpage(
        lpageUrl,
        username,
        `Downloading page ${n}/${pageCount}`,
      );
      for (const m of lpage.matchAll(
        /<div[^>]+class=["']preview[^>]+>\s*<a[^>]+href="(https?:\/\/videos\.toypics\.net\/view\/[^"]+)"/g,
      )) {
        if (m[1]) urls.push(m[1]);
      }
    }

    const entries = urls.map((eurl) => this.url_result(eurl, 'Toypics'));
    return this.playlist_result(entries, username);
  }
}
