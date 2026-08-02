/**
 * LumniIE — ported from yt-dlp lumni.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url } from '../../utils';

export class LumniIE extends InfoExtractor {
  static IE_NAME = 'lumni';
  static _VALID_URL = /https?:\/\/(?:www\.)?lumni\.fr\/video\/(?<id>[\w-]+)/;

  protected _makeUrlResult(videoId: string, pageUrl?: string): VideoInfo {
    const bareId = videoId.split('@')[0]!;
    let fullId = `francetv:${bareId}`;
    if (pageUrl) {
      fullId = smuggle_url(fullId, { hostname: new URL(pageUrl).hostname });
    }
    return this.url_result(fullId, 'FranceTV', bareId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._html_search_regex(/<div[^>]+data-factoryid\s*=\s*["']([^"']+)/, webpage, 'video id')!;
    return this._makeUrlResult(videoId, url);
  }
}
