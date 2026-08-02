/**
 * FrancaisFacileIE ??ported from yt-dlp francaisfacile.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, url_or_none } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class FrancaisFacileIE extends InfoExtractor {
  static IE_NAME = 'francaisfacile';
  static _VALID_URL =
    /https?:\/\/francaisfacile\.rfi\.fr\/[a-z]{2}\/(?:actualit%C3%A9|podcasts\/[^/#?]+)\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = decodeURIComponent(this._match_id(url));
    const webpage = await this._download_webpage(url, displayId);
    const data = this._search_json<Record<string, unknown>>(
      /<script[^>]+\bdata-media-id=[^>]+\btype="application\/json"[^>]*>/,
      webpage,
      'audio data',
      displayId,
    )!;
    const ld = this._search_json_ld(webpage, displayId, { fatal: false });

    const sources = (data.sources as Array<Record<string, unknown>>) || [];
    let mediaUrl: string | undefined;
    let duration: number | undefined;
    for (const source of sources) {
      const u = url_or_none(source.url);
      if (u) mediaUrl = u;
      duration = float_or_none(source.duration) ?? duration;
    }

    return {
      id: String(data.mediaId ?? displayId),
      display_id: displayId,
      vcodec: 'none',
      title: htmlExtractTitle(webpage) || String(data.title ?? displayId),
      ...ld,
      url: mediaUrl,
      duration,
    };
  }
}
