/**
 * GaskrankIE — ported from yt-dlp gaskrank.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, unified_strdate } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class GaskrankIE extends InfoExtractor {
  static IE_NAME = 'gaskrank';
  static _VALID_URL = /https?:\/\/(?:www\.)?gaskrank\.tv\/tv\/(?<categories>[^/]+)\/(?<id>[^/]+)\.htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const title =
      this._og_search_title(webpage) ||
      this._html_search_meta('title', webpage, undefined, true) ||
      displayId;

    const categories = [this._match_valid_url(url)!.groups!.categories!];

    let uploaderId: string | undefined;
    let uploadDate: string | undefined;
    const metaMatch =
      /Video von:\s*(?<uploader_id>[^|]*?)\s*\|\s*vom:\s*(?<upload_date>[0-9][0-9]\.[0-9][0-9]\.[0-9][0-9][0-9][0-9])/.exec(
        webpage,
      );
    if (metaMatch?.groups) {
      uploaderId = metaMatch.groups.uploader_id;
      uploadDate = unified_strdate(metaMatch.groups.upload_date) ?? undefined;
    }

    const uploaderUrl = this._search_regex(
      /Homepage:\s*<[^>]*>(?<uploader_url>[^<]*)/,
      webpage,
      'uploader_url',
      null,
      false,
      'uploader_url',
    );
    const tags = [...webpage.matchAll(/\/tv\/tags\/[^/]+\/"\s*>(?<tag>[^<]*?)</g)].map((m) => m[1]!);

    let viewCount = this._search_regex(
      /class\s*=\s*"gkRight"(?:[^>]*>\s*<[^>]*)*icon-eye-open(?:[^>]*>\s*<[^>]*)*>\s*(?<view_count>[0-9\.]*)/,
      webpage,
      'view_count',
      null,
      false,
      'view_count',
    );
    if (viewCount) viewCount = viewCount.replace(/\./g, '');

    const avgRaw = this._search_regex(
      /itemprop\s*=\s*"ratingValue"[^>]*>\s*(?<average_rating>[0-9,]+)/,
      webpage,
      'average_rating',
      null,
      false,
      'average_rating',
    );

    const videoId =
      this._search_regex(
        /https?:\/\/movies\.gaskrank\.tv\/([^-]*?)(-[^.]*)?\.mp4/,
        webpage,
        'video id',
        null,
        false,
        1,
      ) || displayId;

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    const entry = mediaEntries[0] || { formats: [] };

    return {
      id: videoId,
      title,
      categories,
      display_id: displayId,
      uploader_id: uploaderId,
      upload_date: uploadDate,
      uploader_url: uploaderUrl ?? undefined,
      tags,
      view_count: int_or_none(viewCount) ?? undefined,
      average_rating: float_or_none(avgRaw?.replace(',', '.')) ?? undefined,
      formats: entry.formats,
      subtitles: entry.subtitles,
    };
  }
}
