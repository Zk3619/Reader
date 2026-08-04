// @ts-nocheck
/** VidLiiIE â€?ported from yt-dlp vidlii.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  get_element_by_id,
  int_or_none,
  str_to_int,
  unified_strdate,
} from '../../utils';
import { strip_or_none, urljoin } from './_helpers';

export class VidLiiIE extends InfoExtractor {
  static IE_NAME = 'vidlii';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vidlii\.com\/(?:watch|embed)\?.*?\bv=(?<id>[0-9A-Za-z_-]{11})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `https://www.vidlii.com/watch?v=${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    const sources: string[] = [];
    for (const m of webpage.matchAll(/src\s*:\s*(["'])(?<url>(?:https?:\/\/)?(?:(?!\1).)+)\1/g)) {
      if (m.groups?.url) sources.push(m.groups.url);
    }
    for (const sourceRaw of sources) {
      const source = urljoin(url, sourceRaw);
      const height = Number(this._search_regex(/(\d+)\.mp4/, source, 'height', '360', false) || 360);
      const ok = await this._request_webpage(source, videoId, `Checking ${height}p url`, {
        fatal: false,
      });
      if (ok) {
        formats.push({
          url: source,
          format_id: `${height}p`,
          height,
        });
      }
    }

    const title =
      this._search_regex(
        [/<h1>([^<]+)<\/h1>/, /<title>([^<]+) - VidLii</],
        webpage,
        'title',
      ) || videoId;

    const description =
      this._html_search_meta(['description', 'twitter:description'], webpage) ||
      strip_or_none(get_element_by_id('des_text', webpage) || '') ||
      undefined;

    let thumbnail = this._html_search_meta('twitter:image', webpage) || undefined;
    if (!thumbnail) {
      const thumbnailPath = this._search_regex(
        /img\s*:\s*(["'])(?<url>(?:(?!\1).)+)\1/,
        webpage,
        'thumbnail',
        null,
        false,
        'url',
      );
      if (thumbnailPath) thumbnail = urljoin(url, thumbnailPath);
    }

    const uploader = this._search_regex(
      /<div[^>]+class=["']wt_person[^>]+>\s*<a[^>]+\bhref=["']\/user\/[^>]+>([^<]+)/,
      webpage,
      'uploader',
      null,
      false,
    );
    const uploaderUrl = uploader ? `https://www.vidlii.com/user/${uploader}` : undefined;

    const uploadDate = unified_strdate(
      this._html_search_meta('datePublished', webpage) ||
        this._search_regex(/<date>([^<]+)/, webpage, 'upload date', null, false),
    );

    const duration = int_or_none(
      this._html_search_meta('video:duration', webpage) ||
        this._search_regex(/duration\s*:\s*(\d+)/, webpage, 'duration', null, false),
    );

    const viewCount = str_to_int(
      this._search_regex(
        [/<strong>([,0-9]+)<\/strong> views/, /Views\s*:\s*<strong>([,0-9]+)<\/strong>/],
        webpage,
        'view count',
        null,
        false,
      ),
    );

    const commentCount = int_or_none(
      this._search_regex(
        [/<span[^>]+id=["']cmt_num[^>]+>(\d+)/, /Comments\s*:\s*<strong>(\d+)/],
        webpage,
        'comment count',
        null,
        false,
      ),
    );

    const averageRating = float_or_none(
      this._search_regex(/rating\s*:\s*([\d.]+)/, webpage, 'average rating', null, false),
    );

    const category = this._html_search_regex(
      /<div>Category\s*:\s*<\/div>\s*<div>\s*<a[^>]+>([^<]+)/,
      webpage,
      'category',
      null,
      false,
    );

    const tags = [
      ...webpage.matchAll(/<a[^>]+\bhref=["']\/results\?.*?q=[^>]*>([^<]+)/g),
    ]
      .map((m) => strip_or_none(m[1]))
      .filter(Boolean) as string[];

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      uploader: uploader || undefined,
      formats,
      uploader_url: uploaderUrl,
      upload_date: uploadDate || undefined,
      duration: duration ?? undefined,
      view_count: viewCount ?? undefined,
      comment_count: commentCount ?? undefined,
      average_rating: averageRating ?? undefined,
      categories: category ? [category] : undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}
