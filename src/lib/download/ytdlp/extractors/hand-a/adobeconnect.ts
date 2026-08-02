/**
 * AdobeConnectIE — aligned with yt-dlp adobeconnect.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class AdobeConnectIE extends InfoExtractor {
  static IE_NAME = 'adobeconnect';
  static _VALID_URL = /https?:\/\/\w+\.adobeconnect\.com\/(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title =
      this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', videoId, false) ||
      videoId;
    const swfUrl = this._search_regex(/swfUrl\s*=\s*'([^']+)'/, webpage, 'swf url')!;
    const qsPart = swfUrl.split('?')[1] || '';
    const qs = Object.fromEntries(new URLSearchParams(qsPart).entries());
    const isLive = qs.isLive === 'true';

    const formats: Format[] = [];
    const conStrings = (qs.conStrings || '').split(',');
    for (const conString of conStrings) {
      if (!conString) continue;
      const scheme = conString.split('://')[0] || 'rtmp';
      const appPart = conString.includes('?') ? conString.split('?')[1]! : '';
      formats.push({
        format_id: scheme,
        app: encodeURIComponent(`?${appPart}flvplayerapp/${qs.appInstance || ''}`),
        ext: 'flv',
        play_path: `mp4:${qs.streamName || ''}`,
        rtmp_conn: `S:${qs.ticket || ''}`,
        rtmp_live: isLive,
        url: conString,
      });
    }

    return {
      id: videoId,
      title,
      formats,
      is_live: isLive,
      webpage_url: url,
      original_url: url,
      extractor: AdobeConnectIE.IE_NAME,
      extractor_key: 'AdobeConnect',
    };
  }
}
