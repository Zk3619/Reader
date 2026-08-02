/**
 * GoogleSearchIE — ported from yt-dlp googlesearch.py
 */

import { SearchInfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class GoogleSearchIE extends SearchInfoExtractor {
  static IE_DESC = 'Google Video search';
  static IE_NAME = 'video.google:search';
  static _SEARCH_KEY = 'gvsearch';
  static _PAGE_SIZE = 100;

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    for (let pagenum = 0; entries.length < n; pagenum++) {
      const webpage = await this._download_webpage('http://www.google.com/search', `gvsearch:${query}`, undefined, {
        query: {
          tbm: 'vid',
          q: query,
          start: String(pagenum * GoogleSearchIE._PAGE_SIZE),
          num: String(GoogleSearchIE._PAGE_SIZE),
          hl: 'en',
        },
      });
      for (const m of webpage.matchAll(/<div[^>]* class="dXiKIc"[^>]*><a href="([^"]+)"/g)) {
        entries.push(this.url_result(m[1]!));
        if (entries.length >= n) break;
      }
      if (!/id="pnnext"/.test(webpage)) break;
    }
    return entries.slice(0, n);
  }
}
