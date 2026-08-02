/** NitterIE — ported from yt-dlp nitter.py (compact instance list) */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, parse_count, unified_timestamp } from '../../utils';

const HTTP_INSTANCES = [
  'nitter.poast.org',
  'nitter.privacydev.net',
  'nitter.cz',
  'nitter.tiekoetter.com',
  'nitter.net',
  'xcancel.com',
].join('|');

export class NitterIE extends InfoExtractor {
  static IE_NAME = 'Nitter';
  static _VALID_URL = new RegExp(
    `https?://(?:${HTTP_INSTANCES})/(?<uploader_id>.+)/status/(?<id>[0-9]+)(?:#.)?`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const videoId = m?.groups?.id ?? this._match_id(url);
    let uploaderId = m?.groups?.uploader_id ?? '';
    const parsed = new URL(url);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    let webpage = await this._download_webpage(url, videoId);
    const mainStart = webpage.indexOf('class="main-tweet"');
    if (mainStart > 0) webpage = webpage.slice(mainStart);

    const videoUrl = `${baseUrl}${this._html_search_regex(
      /(?:<video[^>]+data-url|<source[^>]+src)="([^"]+)"/,
      webpage,
      'video url',
    )}`;
    const ext = determine_ext(videoUrl);
    const formats: Format[] =
      ext === 'unknown_video'
        ? await this._extract_m3u8_formats(videoUrl, videoId, 'mp4')
        : [{ url: videoUrl, format_id: ext, ext }];

    let title = this._og_search_description(webpage) ||
      this._html_search_regex(/<div class="tweet-content[^>]+>([^<]+)/, webpage, 'title', null, false) ||
      videoId;
    const description = title;

    uploaderId =
      this._html_search_regex(/<a class="username"[^>]+title="@([^"]+)"/, webpage, 'uploader id', null, false) ||
      uploaderId;
    const uploader = this._html_search_regex(/<a class="fullname"[^>]+title="([^"]+)"/, webpage, 'uploader name', null, false);
    if (uploader) title = `${uploader} - ${title}`;

    const counts: Record<string, number | undefined> = {};
    for (const [field, icon] of [
      ['view', 'play'],
      ['like', 'heart'],
      ['repost', 'retweet'],
      ['comment', 'comment'],
    ] as const) {
      const raw = this._html_search_regex(
        new RegExp(`<span[^>]+class="icon-${icon}[^>]*></span>([^<]*)</div>`),
        webpage,
        `${field} count`,
        null,
        false,
      );
      counts[`${field}_count`] = raw === '' ? 0 : parse_count(raw) ?? undefined;
    }

    let thumbnail =
      this._html_search_meta('og:image', webpage) ||
      this._html_search_regex(/<video[^>]+poster="([^"]+)"/, webpage, 'thumbnail url', null, false);
    if (thumbnail?.endsWith('%3Asmall')) thumbnail = thumbnail.slice(0, -8);

    const thumbnails: Thumbnail[] = ['thumb', 'small', 'large', 'medium', 'orig'].map((id) => ({
      id,
      url: `${thumbnail}%3A${id}`,
    }));

    const date = (this._html_search_regex(/<span[^>]+class="tweet-date"[^>]*><a[^>]+title="([^"]+)"/, webpage, 'upload date', null, false) || '').replace('·', '');

    return {
      id: videoId,
      title,
      description,
      uploader: uploader || undefined,
      timestamp: unified_timestamp(date) ?? undefined,
      uploader_id: uploaderId,
      uploader_url: `${baseUrl}/${uploaderId}`,
      formats,
      thumbnails,
      thumbnail,
      ...counts,
    };
  }
}
