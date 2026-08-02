/** Tube8IE — ported from yt-dlp tube8.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  str_to_int,
  url_or_none,
} from '../../utils';
import { format_field, strip_or_none } from './_helpers';

export class Tube8IE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tube8\.com\/(?:[^/]+\/)+(?<display_id>[^/]+)\/(?<id>\d+)/;

  protected async _extractInfo(url: string): Promise<[string, VideoInfo]> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id || videoId;

    const webpage = await this._download_webpage(url, displayId, undefined, {
      headers: { Cookie: 'age_verified=1' },
    });

    const formats: Format[] = [];
    const formatUrls = new Set<string>();

    let title: string | null = null;
    let thumbnail: string | undefined;
    let duration: number | undefined;
    let encrypted = false;

    const extractFormat = (formatUrl: unknown, height?: number | null) => {
      const resolved = url_or_none(formatUrl);
      if (!resolved || !/^https?:\/\/|^\/\//.test(resolved)) return;
      if (formatUrls.has(resolved)) return;
      formatUrls.add(resolved);
      const tbr =
        int_or_none(
          this._search_regex(/[/_](\d+)[kK][/_]/, resolved, 'tbr', null, false),
        ) ?? undefined;
      const fmtHeight =
        height ??
        int_or_none(this._search_regex(/[/_](\d+)[pP][/_]/, resolved, 'height', null, false)) ??
        undefined;
      if (encrypted) {
        this.report_warning(
          `Skipping encrypted format; AES decryption is not implemented (${videoId})`,
        );
        return;
      }
      formats.push({
        url: resolved,
        format_id: format_field({ height: fmtHeight }, 'height', '%dp') || '0',
        height: fmtHeight,
        tbr,
      });
    };

    const flashvarsRaw = this._search_regex(/flashvars\s*=\s*({.+?});/, webpage, 'flashvars', null, false);
    const flashvars = flashvarsRaw
      ? (this._parse_json(flashvarsRaw, displayId, null, false) as Record<string, unknown> | null)
      : null;

    if (flashvars) {
      title = flashvars.video_title ? String(flashvars.video_title) : null;
      thumbnail = flashvars.image_url ? String(flashvars.image_url) : undefined;
      duration = int_or_none(flashvars.video_duration) ?? undefined;
      encrypted = flashvars.encrypted === true;
      if (encrypted) {
        this.report_warning(
          `Video uses encrypted URLs; AES decryption is not implemented (${videoId})`,
        );
      }
      for (const [key, value] of Object.entries(flashvars)) {
        const qm = /quality_(\d+)[pP]/.exec(key);
        if (qm) extractFormat(value, parseInt(qm[1]!, 10));
      }
      const videoUrl = flashvars.video_url;
      if (videoUrl && determine_ext(String(videoUrl))) extractFormat(videoUrl);
    }

    const inlineVideoUrl = this._html_search_regex(
      /flashvars\.video_url\s*=\s*(["'])(?<url>http.+?)\1/,
      webpage,
      'video url',
      'url',
      false,
    );
    if (inlineVideoUrl) extractFormat(decodeURIComponent(inlineVideoUrl));

    if (!formats.length && webpage.includes('title="This video is no longer available"')) {
      this.raise_no_formats(`Video ${videoId} is no longer available`, true);
    }

    if (!title) {
      title = this._html_search_regex(/<h1[^>]*>([^<]+)/, webpage, 'title', null, false);
    }

    return [
      webpage,
      {
        id: videoId,
        display_id: displayId,
        title: strip_or_none(title) || displayId,
        thumbnail,
        duration,
        age_limit: 18,
        formats,
      },
    ];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [webpage, info] = await this._extractInfo(url);
    const videoId = info.id;

    if (!info.title) {
      const fallbackTitle =
        (typeof info.display_id === 'string' ? info.display_id : null) || info.id || videoId;
      info.title =
        this._html_search_regex(/videoTitle\s*=\s*"([^"]+)/, webpage, 'title', null, false) ||
        fallbackTitle;
    }

    const description = this._html_search_regex(
      /Description:<\/dt>\s*<dd>([\s\S]+?)<\/dd>/,
      webpage,
      'description',
      null,
      false,
    );
    const uploader = this._html_search_regex(
      /<span class="username">\s*(.+?)\s*</,
      webpage,
      'uploader',
      null,
      false,
    );
    const likeCount = int_or_none(
      this._search_regex(/rupVar\s*=\s*"(\d+)"/, webpage, 'like count', null, false),
    );
    const dislikeCount = int_or_none(
      this._search_regex(/rdownVar\s*=\s*"(\d+)"/, webpage, 'dislike count', null, false),
    );
    const viewCount = str_to_int(
      this._search_regex(/Views:\s*<\/dt>\s*<dd>([\d,\.]+)/, webpage, 'view count', null, false),
    );
    const commentCount = str_to_int(
      this._search_regex(/<span id="allCommentsCount">(\d+)<\/span>/, webpage, 'comment count', null, false),
    );
    const category = this._search_regex(
      /Category:\s*<\/dt>\s*<dd>\s*<a[^>]+href=[^>]+>([^<]+)/,
      webpage,
      'category',
      null,
      false,
    );
    const tagsStr = this._search_regex(
      /Tags:\s*<\/dt>\s*<dd>([\s\S]+?)<\/(?!a)/,
      webpage,
      'tags',
      null,
      false,
    );
    const tags = tagsStr
      ? [...tagsStr.matchAll(/<a[^>]+href=[^>]+>([^<]+)/g)].map((m) => m[1]!)
      : undefined;

    return {
      ...info,
      description: description || undefined,
      uploader: uploader || undefined,
      view_count: viewCount ?? undefined,
      like_count: likeCount ?? undefined,
      dislike_count: dislikeCount ?? undefined,
      comment_count: commentCount ?? undefined,
      categories: category ? [category] : undefined,
      tags,
    };
  }
}
