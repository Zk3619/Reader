/**
 * CamsodaIE — ported from yt-dlp camsoda.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class CamsodaIE extends InfoExtractor {
  static IE_NAME = 'camsoda';
  static _VALID_URL = /https?:\/\/www\.camsoda\.com\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId, undefined, { headers: this.geo_verification_headers() });

    const guestName = `guest_${Math.floor(Math.random() * (99999 - 10000) + 10000)}`;
    const data = await this._download_json<Record<string, unknown>>(
      `https://camsoda.com/api/v1/video/vtoken/${videoId}`,
      videoId,
      undefined,
      { query: { username: guestName }, headers: this.geo_verification_headers() },
    );
    if (!data || !Object.keys(data).length) {
      throw new ExtractorError('Unable to find configuration for stream.');
    } else if (data.private_servers) {
      throw new ExtractorError('Model is in private show.', { expected: true });
    } else if (!data.stream_name) {
      throw new ExtractorError('Model is offline.', { expected: true });
    }

    const streamName = traverse_obj(data, 'stream_name') as string;
    const token = traverse_obj(data, 'token') as string;

    let formats: Format[] = [];
    for (const server of (traverse_obj(data, ['edge_servers']) as string[]) || []) {
      formats = await this._extract_m3u8_formats(
        `https://${server}/${streamName}_v1/index.m3u8?token=${token}`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      if (formats.length) break;
    }
    if (!formats.length) this.raise_no_formats('No active streams found', true);

    return {
      id: videoId,
      title: htmlExtractTitle(webpage) || videoId,
      description: this._html_search_meta('description', webpage),
      is_live: true,
      formats,
      age_limit: 18,
    };
  }
}
