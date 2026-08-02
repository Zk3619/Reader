/**
 * MuseScoreIE — ported from yt-dlp musescore.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { md5Hex } from './_helpers';

function generateAuthToken(videoId: string): string {
  return md5Hex(`${videoId}mp30gs`).slice(0, 4);
}

export class MuseScoreIE extends InfoExtractor {
  static IE_NAME = 'musescore';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?musescore\.com\/(?:user\/\d+|[^/]+)(?:\/scores)?\/(?<id>[^#&?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, 'musescore');
    const ogUrl =
      this._html_search_meta('og:url', webpage, 'og:url', false) ||
      this._og_search_property('url', webpage, 'og:url', false);
    const resolvedUrl = ogUrl || url;
    const videoId = this._match_id(resolvedUrl);

    const mp3Response = await this._download_json<{ info: { url: string } }>(
      'https://musescore.com/api/jmuse',
      videoId,
      undefined,
      {
        headers: { authorization: generateAuthToken(videoId) },
        query: { id: videoId, index: '0', type: 'mp3' },
      },
    );

    const formats: Format[] = [
      {
        url: mp3Response.info.url,
        format_id: 'mp3',
        ext: 'mp3',
        vcodec: 'none',
      },
    ];

    return {
      id: videoId,
      formats,
      title: this._og_search_title(webpage) || undefined,
      description: this._html_search_meta('description', webpage, 'description') || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      uploader: this._html_search_meta('musescore:author', webpage, 'uploader') || undefined,
      creator: this._html_search_meta('musescore:composer', webpage, 'composer') || undefined,
    };
  }
}
