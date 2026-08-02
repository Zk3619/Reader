/** PopcorntimesIE — ported from yt-dlp popcorntimes.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

function decodePctmLoc(loc: string): string {
  let locB64 = '';
  for (const c of loc) {
    let cOrd = c.charCodeAt(0);
    if ((cOrd >= 97 && cOrd <= 122) || (cOrd >= 65 && cOrd <= 90)) {
      const upper = cOrd <= 90 ? 90 : 122;
      cOrd += 13;
      if (upper < cOrd) cOrd -= 26;
    }
    locB64 += String.fromCharCode(cOrd);
  }
  return atob(locB64);
}

export class PopcorntimesIE extends InfoExtractor {
  static IE_NAME = 'popcorntimes';
  static _VALID_URL =
    /https?:\/\/popcorntimes\.tv\/[^/]+\/m\/(?<id>[^/]+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';
    const webpage = await this._download_webpage(url, displayId);

    const title =
      this._search_regex(/<h1>([^<]+)/, webpage, 'title', null, false) ||
      this._html_search_meta('ya:ovs:original_name', webpage, 'title') ||
      undefined;

    const loc = this._search_regex(
      /PCTMLOC\s*=\s*(["'])(?<value>(?:(?!\1).)+)\1/,
      webpage,
      'loc',
      'value',
    )!;
    const videoUrl = decodePctmLoc(loc);

    const description = this._html_search_regex(
      /<div[^>]+class=["']pt-movie-desc[^>]+>([\s\S]*?)<\/div>/,
      webpage,
      'description',
      null,
      false,
    );
    const thumbnail =
      this._search_regex(
        /<img[^>]+class=["']video-preview[^>]+\bsrc=(["'])(?<value>(?:(?!\1).)+)\1/,
        webpage,
        'thumbnail',
        'value',
        false,
      ) || this._og_search_thumbnail(webpage);

    const releaseDate = this._html_search_meta('video:release_date', webpage, undefined, false);
    const intMeta = (name: string) => int_or_none(this._html_search_meta(name, webpage, undefined, false));

    return {
      id: videoId,
      display_id: displayId,
      formats: [{ url: videoUrl, format_id: 'http', ext: 'mp4' }],
      title,
      description: description ?? undefined,
      thumbnail: thumbnail ?? undefined,
      creator: this._html_search_meta('video:director', webpage, 'creator', false) ?? undefined,
      release_date: releaseDate ? releaseDate.replace(/-/g, '') : undefined,
      duration: intMeta('video:duration') ?? undefined,
      tbr: intMeta('ya:ovs:bitrate') ?? undefined,
      width: intMeta('og:video:width') ?? undefined,
      height: intMeta('og:video:height') ?? undefined,
      http_headers: { Referer: url },
    };
  }
}
