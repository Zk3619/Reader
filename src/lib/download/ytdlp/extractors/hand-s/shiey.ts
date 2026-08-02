/** ShieyIE — ported from yt-dlp shiey.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';

export class ShieyIE extends InfoExtractor {
  static IE_NAME = 'shiey';
  static _VALID_URL = /https?:\/\/(?:www\.)?shiey\.com\/videos\/v\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const embedMatch = webpage.match(
      /<[^>]+data-controller=["']VideoEmbed["'][^>]*data-config-embed-video=["']([^"']+)["']/i,
    );
    if (!embedMatch) {
      return this.url_result(url, 'generic', videoId);
    }
    const attrs = extract_attributes(embedMatch[0]!);
    const config = JSON.parse(attrs['data-config-embed-video'] || '{}') as Record<string, unknown>;
    const oembedHtml = String(config.oembedHtml || '');
    const vimeoUrl = this._search_regex(
      /https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/,
      oembedHtml,
      'vimeo url',
    );
    return this.url_result(`https://vimeo.com/${vimeoUrl}`, 'Vimeo', vimeoUrl);
  }
}
