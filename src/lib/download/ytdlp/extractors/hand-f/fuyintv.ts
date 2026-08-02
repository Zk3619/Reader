/**
 * FuyinTVIE â€?ported from yt-dlp fuyintv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';

export class FuyinTVIE extends InfoExtractor {
  static IE_NAME = 'fuyintv';
  static _VALID_URL = /https?:\/\/(?:www\.)?fuyin\.tv\/html\/(?:\d+)\/(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const jsonData = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://www.fuyin.tv/api/api/tv.movie/url',
      videoId,
      undefined,
      { query: { urlid: videoId } },
    );
    const webpage = await this._download_webpage(url, videoId, undefined, { fatal: false });
    const data = jsonData.data || {};

    return {
      id: videoId,
      title: traverse_obj(data, ['title', String]) as string | undefined,
      url: String(data.url ?? ''),
      ext: 'mp4',
      description: this._html_search_meta('description', webpage, undefined, false) ?? undefined,
    };
  }
}
