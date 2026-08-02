/**
 * Ku6IE — ported from yt-dlp ku6.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class Ku6IE extends InfoExtractor {
  static IE_NAME = 'ku6';
  static _VALID_URL = /https?:\/\/v\.ku6\.com\/show\/(?<id>[a-zA-Z0-9\-\_]+)(?:\.)*html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title = this._html_search_regex(/<h1 title=.*>(.*?)<\/h1>/, webpage, 'title') ?? videoId;
    const jsonData = await this._download_json<{ data?: { f?: string } }>(
      `http://v.ku6.com/fetchVideo4Player/${videoId}.html`,
      videoId,
    );

    return {
      id: videoId,
      title,
      url: String(jsonData.data?.f ?? ''),
    };
  }
}
