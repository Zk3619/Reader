/**
 * BloombergIE — aligned with yt-dlp bloomberg.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class BloombergIE extends InfoExtractor {
  static IE_NAME = 'bloomberg';
  static _VALID_URL = /https?:\/\/(?:www\.)?bloomberg\.com\/(?:[^/]+\/)*(?<id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const name = this._match_id(url);
    const webpage = await this._download_webpage(url, name);
    let videoId = this._search_regex(
      [
        /["']bmmrId["']\s*:\s*(["'])(?<id>(?:(?!\1).)+)\1/,
        /videoId\s*:\s*(["'])(?<id>(?:(?!\1).)+)\1/,
        /data-bmmrid=(["'])(?<id>(?:(?!\1).)+)\1/,
      ],
      webpage,
      'id',
      null,
      false,
      'id',
    );
    if (!videoId) {
      const bplayerData = this._parse_json<{ id: string }>(
        this._search_regex(/BPlayer\(null,\s*(\{[^;]+\})\);/, webpage, 'id'),
        name,
      )!;
      videoId = bplayerData.id;
    }
    const title = (this._og_search_title(webpage) || '').replace(/: Video$/, '');

    const embedInfo = await this._download_json<Record<string, unknown>>(
      `http://www.bloomberg.com/multimedia/api/embed?id=${videoId}`,
      videoId,
    );
    const formats: Format[] = [];
    for (const stream of (embedInfo.streams as Record<string, unknown>[]) || []) {
      const streamUrl = stream.url ? String(stream.url) : '';
      if (!streamUrl) continue;
      if (stream.muxing_format === 'TS') {
        formats.push(
          ...(await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({ format_id: 'hds', url: streamUrl, ext: 'flv', protocol: 'https' });
      }
    }

    return {
      id: videoId,
      title,
      formats,
      description: this._og_search_description(webpage),
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'bloomberg',
      extractor_key: 'Bloomberg',
    };
  }
}
