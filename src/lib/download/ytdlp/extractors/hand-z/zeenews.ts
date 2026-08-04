// @ts-nocheck
/** ZeeNewsIE â€?ported from yt-dlp zeenews.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class ZeeNewsIE extends InfoExtractor {
  static IE_NAME = 'zeenews';
  static _WORKING = false;
  static _ENABLED = null;
  static _VALID_URL =
    /https?:\/\/zeenews\.india\.com\/[^#?]+\/video\/(?<display_id>[^#/?]+)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const contentId = m?.groups?.id || this._match_id(url);
    const displayId = m?.groups?.display_id || contentId;
    const webpage = await this._download_webpage(url, contentId);
    const jsonLd = (this._search_json_ld(webpage, displayId, { fatal: false }) || {}) as Record<
      string,
      unknown
    >;
    const embedUrl = typeof jsonLd.embedUrl === 'string' ? jsonLd.embedUrl : null;
    if (!embedUrl) throw new ExtractorError('No video found', { expected: true });

    const formats = await this._extract_m3u8_formats(embedUrl, contentId, 'mp4', 'm3u8_native');
    return {
      ...jsonLd,
      id: contentId,
      display_id: displayId,
      formats,
    };
  }
}
