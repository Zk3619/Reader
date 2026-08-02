/**
 * DrTuberIE — ported from yt-dlp drtuber.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, str_to_int } from '../../utils';
import { rtaSearch } from './_helpers';

export class DrTuberIE extends InfoExtractor {
  static IE_NAME = 'drtuber';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m)\.)?drtuber\.com\/(?:video|embed)\/(?<id>\d+)(?:\/(?<display_id>[\w-]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups?.display_id || videoId;
    const webpage = await this._download_webpage(`http://www.drtuber.com/video/${videoId}`, displayId);

    const videoData = await this._download_json<{ files: Record<string, string>; duration?: unknown; duration_format?: string }>(
      'http://www.drtuber.com/player_config_json/',
      videoId,
      undefined,
      { query: { vid: videoId, embed: '0', aid: '0', domain_id: '0' } },
    );

    const formats: Format[] = [];
    for (const [formatId, videoUrl] of Object.entries(videoData.files || {})) {
      if (videoUrl) {
        formats.push({
          format_id: formatId,
          quality: formatId === 'hq' ? 2 : 1,
          url: videoUrl,
        });
      }
    }

    const duration =
      int_or_none(videoData.duration) ??
      parse_duration(videoData.duration_format) ??
      undefined;

    const title =
      this._html_search_regex(
        [
          /<h1[^>]+class=["']title[^>]+>([^<]+)/,
          /<title>([^<]+)\s*@\s+DrTuber/,
          /class="title_watch"[^>]*><(?:p|h\d+)[^>]*>([^<]+)</,
          /<p[^>]+class="title_substrate">([^<]+)<\/p>/,
          /<title>([^<]+) - \d+/,
        ],
        webpage,
        'title',
      ) || displayId;

    const thumbnail = this._html_search_regex(/poster="([^"]+)"/, webpage, 'thumbnail', null, false) ?? undefined;

    const extractCount = (id: string, name: string, allowMissing = false): number | null => {
      const val = this._html_search_regex(
        new RegExp(`<span[^>]+(?:class|id)="${id}"[^>]*>([\\d,\\.]+)</span>`),
        webpage,
        `${name} count`,
        allowMissing ? null : undefined,
        !allowMissing,
      );
      return val != null ? str_to_int(val) : null;
    };

    const likeCount = extractCount('rate_likes', 'like');
    const dislikeCount = extractCount('rate_dislikes', 'dislike', true);
    const commentCount = extractCount('comments_count', 'comment');

    const catsStr = this._search_regex(/<div[^>]+class="categories_list">(.+?)<\/div>/s, webpage, 'categories', null, false);
    const categories = catsStr ? [...catsStr.matchAll(/<a title="([^"]+)"/g)].map((cm) => cm[1]!) : [];

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title,
      thumbnail,
      like_count: likeCount ?? undefined,
      dislike_count: dislikeCount ?? undefined,
      comment_count: commentCount ?? undefined,
      categories,
      age_limit: rtaSearch(webpage) ?? undefined,
      duration,
    };
  }
}
