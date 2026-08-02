/** RideHomeIE — ported from yt-dlp ridehome.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';
import { playlistFromMatches } from './_helpers';

function getElementsHtmlByClass(cls: string, html: string): string[] {
  const re = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi');
  return [...html.matchAll(re)].map((m) => m[0]!);
}

function art19Suitable(u: string): boolean {
  return /https?:\/\/(?:www\.)?art19\.com\/shows\/[^/#?]+\/episodes\//.test(u) || /https?:\/\/rss\.art19\.com\/episodes\/.+\.mp3/.test(u);
}

export class RideHomeIE extends InfoExtractor {
  static IE_NAME = 'ridehome';
  static _VALID_URL = /https?:\/\/(?:www\.)?ridehome\.info\/show\/[\w-]+\/(?<id>[\w-]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const urls: string[] = [];
    for (const el of getElementsHtmlByClass('iframeContainer', webpage)) {
      const attrs = extract_attributes(el);
      const src = attrs['data-src'];
      if (src && art19Suitable(src)) urls.push(src);
    }
    return playlistFromMatches(this, urls, articleId, { ie: 'Art19' });
  }
}
