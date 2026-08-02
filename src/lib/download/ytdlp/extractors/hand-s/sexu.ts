/** SexuIE — ported from yt-dlp sexu.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class SexuIE extends InfoExtractor {
  static IE_NAME = 'sexu';
  static _VALID_URL = /https?:\/\/(?:www\.)?sexu\.com\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jwRaw = this._search_regex(/\.setup\(\s*({.+?})\s*\);/, webpage, 'jwvideo')!;
    const jwvideo = this._parse_json<Record<string, unknown>>(jwRaw, videoId)!;

    const formats: Format[] = [];
    for (const source of (jwvideo.sources as Array<Record<string, unknown>>) || []) {
      const file = source.file as string | undefined;
      if (!file) continue;
      const label = String(source.label || '');
      const heightM = /^(\d+)[pP]/.exec(label);
      formats.push({
        url: file.replace(/\\/g, ''),
        format_id: label || `http-${formats.length}`,
        height: heightM ? parseInt(heightM[1]!, 10) : undefined,
      });
    }

    const title =
      this._html_search_regex(/<title>([^<]+)\s*-\s*Sexu\.Com<\/title>/, webpage, 'title') || videoId;
    const description = this._html_search_meta('description', webpage, 'description', false) || undefined;
    const categoriesStr = this._html_search_meta('keywords', webpage, 'categories', false);

    return {
      id: videoId,
      title,
      description,
      thumbnail: jwvideo.image as string | undefined,
      categories: categoriesStr ? categoriesStr.split(',') : undefined,
      formats,
      age_limit: 18,
    };
  }
}
