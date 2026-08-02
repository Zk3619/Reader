/** SoundgasmIE / SoundgasmProfileIE — ported from yt-dlp soundgasm.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class SoundgasmIE extends InfoExtractor {
  static IE_NAME = 'soundgasm';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?soundgasm\.net\/u\/(?<user>[0-9a-zA-Z_-]+)\/(?<display_id>[0-9a-zA-Z_-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const user = m.groups!.user!;
    const webpage = await this._download_webpage(url, displayId);
    const audioUrl = this._html_search_regex(
      /m4a\s*:\s*(["'])(?<url>(?:(?!\1).)+)\1/s,
      webpage,
      'audio URL',
      null,
      false,
      'url',
    )!;
    const title =
      this._search_regex(/<div[^>]+\bclass=["']jp-title[^>]+>([^<]+)/, webpage, 'title', displayId) ||
      displayId;
    const description =
      this._html_search_regex(
        [
          /<div[^>]+\bclass=["']jp-description[^>]+>(.+?)<\/div>/s,
          /<li>Description:\s(.*?)<\/li>/s,
        ],
        webpage,
        'description',
        null,
        false,
      ) || undefined;
    const audioId =
      this._search_regex(/\/([^/]+)\.m4a/, audioUrl, 'audio id', displayId) || displayId;
    return {
      id: audioId,
      display_id: displayId,
      url: audioUrl,
      vcodec: 'none',
      title,
      description,
      uploader: user,
    };
  }
}

export class SoundgasmProfileIE extends InfoExtractor {
  static IE_NAME = 'soundgasm:profile';
  static _VALID_URL = /https?:\/\/(?:www\.)?soundgasm\.net\/u\/(?<id>[^/]+)\/?(?:#.*)?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const profileId = this._match_id(url);
    const webpage = await this._download_webpage(url, profileId);
    const re = new RegExp(`href="([^"]+/u/${profileId}/[^"]+)"`, 'g');
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(re)) {
      entries.push(this.url_result(m[1]!, 'Soundgasm'));
    }
    return this.playlist_result(entries, profileId);
  }
}
