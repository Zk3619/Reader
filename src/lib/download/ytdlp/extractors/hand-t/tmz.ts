/**
 * TMZIE — ported from yt-dlp tmz.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

function getElementByAttribute(attr: string, value: string, html: string): string | null {
  const re = new RegExp(`<[^>]+\\b${attr}=["']${value}["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
  const m = html.match(re);
  return m?.[1] ?? null;
}

export class TMZIE extends InfoExtractor {
  static IE_NAME = 'tmz';
  static _VALID_URL = /https?:\/\/(?:www\.)?tmz\.com\/.*/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, url);
    const jsonld = this._search_json_ld(webpage, url, { fatal: false });
    if (jsonld && jsonld.url) {
      if (!jsonld.id) jsonld.id = url;
      return jsonld as VideoInfo;
    }

    const ytMatch = webpage.match(/\.cueVideoById\(\s*(['"])(.*?)\1/);
    if (ytMatch?.[2]) return this.url_result(ytMatch[2], 'Youtube');

    const blockquoteEl = getElementByAttribute('class', 'twitter-tweet', webpage);
    if (blockquoteEl) {
      for (const m of blockquoteEl.matchAll(/<a[^>]+href=\s*(['"])(.*?)\1/gi)) {
        const link = m[2];
        if (link && link.includes('/status/')) return this.url_result(link, 'Twitter');
      }
    }

    throw new ExtractorError('No video found!', { expected: true });
  }
}
