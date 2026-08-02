/**
 * BloggerIE — aligned with yt-dlp blogger.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { mimetype2ext, parse_duration, parse_qs, str_or_none } from '../../utils';

interface BloggerStream {
  play_url: string;
  format_id?: string | number;
}

export class BloggerIE extends InfoExtractor {
  static IE_NAME = 'blogger.com';
  static _VALID_URL = /https?:\/\/(?:www\.)?blogger\.com\/video\.g\?token=(?<id>.+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const tokenId = this._match_id(url);
    const webpage = await this._download_webpage(url, tokenId);
    const data = this._search_json<{ iframe_id?: string; streams: BloggerStream[]; thumbnail?: string }>(
      /var\s+VIDEO_CONFIG\s*=/,
      webpage,
      'JSON data',
      tokenId,
    )!;
    const streams = data.streams || [];
    const formats: Format[] = streams.map((stream, i) => ({
      ext: mimetype2ext(String(parse_qs(stream.play_url).mime?.[0] || '')) || undefined,
      url: stream.play_url,
      format_id: str_or_none(stream.format_id) || String(i),
    }));

    return {
      id: data.iframe_id || tokenId,
      title: data.iframe_id || tokenId,
      formats,
      thumbnail: data.thumbnail,
      duration: streams[0] ? parse_duration(parse_qs(streams[0].play_url).dur?.[0]) ?? undefined : undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'blogger.com',
      extractor_key: 'Blogger',
    };
  }
}
