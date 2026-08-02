/**
 * EmbedlyIE — ported from yt-dlp embedly.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs, smuggle_url, traverse_obj } from '../../utils';

export class EmbedlyIE extends InfoExtractor {
  static IE_NAME = 'embedly';
  static _VALID_URL =
    /https?:\/\/(?:www|cdn\.)?embedly\.com\/widgets\/media\.html\?(?:[^#]*?&)?(?:src|url)=(?:[^#&]+)/;

  static extractFromWebpage(_ie: EmbedlyIE, _url: string, webpage: string): VideoInfo[] {
    const results: VideoInfo[] = [];
    for (const m of webpage.matchAll(/class=["']embedly-card["'][^>]href=["']([^"']+)/g)) {
      results.push(_ie.url_result(m[1]!));
    }
    for (const m of webpage.matchAll(/class=["']embedly-embed["'][^>]src=["'][^"']*url=([^&]+)/g)) {
      results.push(_ie.url_result(decodeURIComponent(m[1]!)));
    }
    return results;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const srcParam = decodeURIComponent(traverse_obj(qs, ['url', 0]) || '');
    if (srcParam && /youtube\.com\/embed\/videoseries\?list=/i.test(srcParam)) {
      return this.url_result(srcParam, 'YoutubeTab');
    }
    const target = decodeURIComponent(traverse_obj(qs, ['src', 0]) || traverse_obj(qs, ['url', 0]) || '');
    return this.url_result(smuggle_url(target, { referer: url }));
  }
}
