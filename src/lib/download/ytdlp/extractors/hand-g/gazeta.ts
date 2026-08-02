/**
 * GazetaIE — ported from yt-dlp gazeta.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class GazetaIE extends InfoExtractor {
  static IE_NAME = 'gazeta';
  static _VALID_URL =
    /(?<url>https?:\/\/(?:www\.)?gazeta\.ru\/(?:[^/]+\/)?video\/(?:main\/)*(?:\d{4}\/\d{2}\/\d{2}\/)?(?<id>[A-Za-z0-9-_.]+)\.s?html)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const pageUrl = m.groups!.url!;
    const embedUrl = `${pageUrl}?p=embed`;
    const embedPage = await this._download_webpage(embedUrl, displayId, 'Downloading embed page');
    const videoId = this._search_regex(
      /<div[^>]*?class="eagleplayer"[^>]*?data-id="([^"]+)"/,
      embedPage,
      'video id',
    );
    return this.url_result(`eagleplatform:gazeta.media.eagleplatform.com:${videoId}`, 'EaglePlatform');
  }
}
