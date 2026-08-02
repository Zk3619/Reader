/**
 * MovingImageIE — ported from yt-dlp movingimage.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, unescapeHTML } from '../../utils';

export class MovingImageIE extends InfoExtractor {
  static IE_NAME = 'movingimage';
  static _VALID_URL = /https?:\/\/movingimage\.nls\.uk\/film\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats = await this._extract_m3u8_formats(
      this._html_search_regex(/file\s*:\s*"([^"]+)"/, webpage, 'm3u8 manifest URL')!,
      videoId,
      'mp4',
      'm3u8_native',
    );

    const searchField = (fieldName: string, fatal = false): string | null =>
      this._search_regex(
        new RegExp(
          `<span\\s+class="field_title">${fieldName}:</span>\\s*<span\\s+class="field_content">([^<]+)</span>`,
        ),
        webpage,
        fieldName,
        null,
        fatal,
      );

    const title = unescapeHTML(searchField('Title', true) || '').replace(/^[([]|[)\]]$/g, '');
    const description = unescapeHTML(searchField('Description') || '') || undefined;
    const duration = parse_duration(searchField('Running time') || '') ?? undefined;
    const thumbnail =
      this._search_regex(/image\s*:\s*'([^']+)'/, webpage, 'thumbnail', null, false) || undefined;

    return {
      id: videoId,
      formats,
      title,
      description,
      duration,
      thumbnail,
    };
  }
}
