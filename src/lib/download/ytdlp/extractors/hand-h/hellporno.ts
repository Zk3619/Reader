/**
 * HellPornoIE — ported from yt-dlp hellporno.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, merge_dicts, remove_end, unified_timestamp } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class HellPornoIE extends InfoExtractor {
  static IE_NAME = 'hellporno';
  static _VALID_URL = /https?:\/\/(?:www\.)?hellporno\.(?:com\/videos|net\/v)\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const rawTitle = this._og_search_title(webpage);
    const title = remove_end(rawTitle, ' - Hell Porno') || rawTitle || displayId;

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, displayId);
    const info = mediaEntries[0] || { formats: [], subtitles: {} };

    const videoId =
      this._search_regex(
        [/chs_object\s*=\s*["'](\d+)/, /params\[["']video_id["']\]\s*=\s*(\d+)/],
        webpage,
        'video id',
        displayId,
        false,
      ) || displayId;

    const description = this._search_regex(
      /class=["']desc_video_view_v2[^>]+>([^<]+)/,
      webpage,
      'description',
      null,
      false,
    );
    const keywords = this._html_search_meta('keywords', webpage, 'categories', false) || '';
    const categories = keywords
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const duration = int_or_none(this._og_search_property('video:duration', webpage, undefined, false));
    const timestamp = unified_timestamp(this._og_search_property('video:release_date', webpage, undefined, false));
    const viewCount = int_or_none(this._search_regex(/>Views\s+(\d+)/, webpage, 'view count', null, false));

    return merge_dicts(
      {
        id: videoId,
        display_id: displayId,
        title,
        description: description ?? undefined,
        categories: categories.length ? categories : undefined,
        duration: duration ?? undefined,
        timestamp: timestamp ?? undefined,
        view_count: viewCount ?? undefined,
        age_limit: 18,
        formats: info.formats,
        subtitles: Object.keys(info.subtitles).length ? info.subtitles : undefined,
      },
      {},
    ) as VideoInfo;
  }
}
