/** PornoXOIE — ported from yt-dlp pornoxo.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, str_to_int } from '../../utils';
import { parseJwplayerData } from './_helpers';

export class PornoXOIE extends InfoExtractor {
  static IE_NAME = 'pornoxo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?pornoxo\.com\/videos\/(?<id>\d+)\/(?<display_id>[^/]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';
    const webpage = await this._download_webpage(url, videoId);

    const jwRaw = this._search_regex(
      /jwplayer\s*\([^)]+\)\.setup\s*\(\s*({[\s\S]+?})\s*\)/,
      webpage,
      'jwplayer setup',
      null,
      false,
    );
    const jwData = jwRaw ? this._parse_json(jwRaw, videoId, js_to_json, false) : {};
    const videoData = await parseJwplayerData(this, jwData, videoId, { requireTitle: false });

    const title = this._html_search_regex(/<title>([^<]+)\s*-\s*PornoXO/, webpage, 'title');
    const viewCount = str_to_int(
      this._html_search_regex(/[vV]iews:\s*([0-9,]+)/, webpage, 'view count', null, false),
    );
    const categoriesStr = this._html_search_regex(
      /<meta name="description" content=".*featuring\s*([^"]+)"/,
      webpage,
      'categories',
      null,
      false,
    );

    return {
      ...videoData,
      id: videoId,
      title,
      display_id: displayId,
      description: this._html_search_meta('description', webpage) ?? undefined,
      categories: categoriesStr ? categoriesStr.split(',') : undefined,
      view_count: viewCount ?? undefined,
      age_limit: 18,
    };
  }
}
