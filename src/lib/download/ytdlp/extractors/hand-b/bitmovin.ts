/**
 * BitmovinIE — aligned with yt-dlp bitmovin.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none } from '../../utils';

export class BitmovinIE extends InfoExtractor {
  static IE_NAME = 'bitmovin';
  static _VALID_URL = /https?:\/\/streams\.bitmovin\.com\/(?<id>\w+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const config = await this._download_json<Record<string, unknown>>(
      `https://streams.bitmovin.com/${videoId}/config`,
      videoId,
    );
    const sources = (config.sources as Record<string, unknown>) || {};

    const formats = await this._extract_m3u8_formats(String(sources.hls), videoId, 'mp4');

    return {
      id: videoId,
      formats,
      title: str_or_none(sources.title) || videoId,
      thumbnail: str_or_none(sources.poster) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'bitmovin',
      extractor_key: 'Bitmovin',
    };
  }
}
