/**
 * LemondeIE — ported from yt-dlp lemonde.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { protoRelative } from './_helpers';

export class LemondeIE extends InfoExtractor {
  static IE_NAME = 'lemonde';
  static _VALID_URL = /https?:\/\/(?:.+?\.)?lemonde\.fr\/(?:[^/]+\/)*(?<id>[^/]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const digitekaUrl = protoRelative(
      this._search_regex(
        /url\s*:\s*(["'])(?<url>(?:https?:\/\/)?\/\/(?:www\.)?(?:digiteka\.net|ultimedia\.com)\/deliver\/.+?)\1/,
        webpage,
        'digiteka url',
        null,
        false,
        'url',
      ) || '',
    );

    if (digitekaUrl) {
      return this.url_result(digitekaUrl, 'Digiteka');
    }

    return this.url_result(url, 'Generic');
  }
}
