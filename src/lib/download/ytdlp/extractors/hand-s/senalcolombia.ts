/** SenalColombiaLiveIE — ported from yt-dlp senalcolombia.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class SenalColombiaLiveIE extends InfoExtractor {
  static IE_NAME = 'senalcolombia';
  static _VALID_URL = /https?:\/\/(?:www\.)?senalcolombia\.tv\/(?<id>senal-en-vivo)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const hydration = this._search_json<Record<string, unknown>>(
      /<script\b[^>]*data-drupal-selector\s*=\s*"[^"]*drupal-settings-json[^"]*"[^>]*>/,
      webpage,
      'hydration',
      displayId,
    );
    return this.url_result(String(hydration?.envivosrc || ''), 'RTVCKaltura', displayId);
  }
}
