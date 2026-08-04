// @ts-nocheck
/** XXXYMoviesIE â€?ported from yt-dlp xxxymovies.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { rtaSearch } from './_helpers';

export class XXXYMoviesIE extends InfoExtractor {
  static IE_NAME = 'XXXYMovies';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?xxxymovies\.com\/videos\/(?<id>\d+)\/(?<display_id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const videoId = mobj.groups!.id!;
    const displayId = mobj.groups!.display_id!;

    const webpage = await this._download_webpage(url, displayId);

    const videoUrl = this._search_regex(/video_url\s*:\s*'([^']+)'/, webpage, 'video URL')!;

    const title = this._html_search_regex(
      [
        /<div[^>]+\bclass="block_header"[^>]*>\s*<h1>([^<]+)</,
        /<title>(.*?)\s*-\s*(?:XXXYMovies\.com|XXX\s+Movies)<\/title>/,
      ],
      webpage,
      'title',
    )!;

    const thumbnail = this._search_regex(
      /preview_url\s*:\s*'([^']+)'/,
      webpage,
      'thumbnail',
      null,
      false,
    );

    const categories = (this._html_search_meta('keywords', webpage, 'categories') || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const duration = parse_duration(
      this._search_regex(/<span>Duration:<\/span>\s*(\d+:\d+)/, webpage, 'duration', null, false),
    );

    const viewCount = int_or_none(
      this._html_search_regex(
        /<div class="video_views">\s*(\d+)/,
        webpage,
        'view count',
        null,
        false,
      ),
    );
    const likeCount = int_or_none(
      this._search_regex(/>\s*Likes? <b>\((\d+)\)/, webpage, 'like count', null, false),
    );
    const dislikeCount = int_or_none(
      this._search_regex(/>\s*Dislike <b>\((\d+)\)<\/b>/, webpage, 'dislike count', null, false),
    );

    return {
      id: videoId,
      display_id: displayId,
      url: videoUrl,
      title,
      thumbnail: thumbnail || undefined,
      categories: categories.length ? categories : undefined,
      duration: duration ?? undefined,
      view_count: viewCount ?? undefined,
      like_count: likeCount ?? undefined,
      dislike_count: dislikeCount ?? undefined,
      age_limit: rtaSearch(webpage) ?? undefined,
    };
  }
}
