/**
 * HarpodeonIE — ported from yt-dlp harpodeon.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class HarpodeonIE extends InfoExtractor {
  static IE_NAME = 'harpodeon';
  static _VALID_URL = /https?:\/\/(?:www\.)?harpodeon\.com\/(?:video|preview)\/\w+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const titleMatch = webpage.match(
      /<div[^>]+videoInfo[^<]*<h2[^>]*>(?<title>[^>]+)<\/h2>(?:\s*<p[^>]*>\((?<creator>.+),\s*)?(?<release_year>\d{4})?/i,
    );
    const title = titleMatch?.groups?.title ?? undefined;
    const creator = titleMatch?.groups?.creator ?? undefined;
    const releaseYear = int_or_none(titleMatch?.groups?.release_year);

    const hpBase = this._html_search_regex(/hpBase\(\s*["']([^"']+)/, webpage, 'hp_base');
    const injectMatch = webpage.match(
      /hpInjectVideo\(['"](?<hp_inject_video>\w+)['"],\s*['"](?<hp_resolution>\d+)['"]/i,
    );
    const hpInjectVideo = injectMatch?.groups?.hp_inject_video;
    const hpResolution = injectMatch?.groups?.hp_resolution;
    if (!hpBase || !hpInjectVideo || !hpResolution) {
      throw new Error('Unable to extract video URL components');
    }

    return {
      id: videoId,
      title: title ?? videoId,
      url: `${hpBase}${hpInjectVideo}_${hpResolution}.mp4`,
      http_headers: { Referer: url },
      description: this._html_search_meta('description', webpage, undefined, false) ?? undefined,
      creator: creator ?? undefined,
      release_year: releaseYear ?? undefined,
    };
  }
}
