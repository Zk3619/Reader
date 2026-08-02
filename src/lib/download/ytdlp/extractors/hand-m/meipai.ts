/** MeipaiIE — ported from yt-dlp meipai.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, unified_timestamp } from '../../utils';
import { genericTitle } from './_helpers';

export class MeipaiIE extends InfoExtractor {
  static IE_NAME = 'meipai';
  static IE_DESC = '美拍';
  static _VALID_URL = /https?:\/\/(?:www\.)?meipai\.com\/media\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = genericTitle(this, url, webpage);
    const formats: Format[] = [];

    const m3u8Url = this._html_search_regex(
      /file:\s*encodeURIComponent\((["'])(?<url>(?:(?!\1).)+)\1/,
      webpage,
      'm3u8 url',
      null,
      false,
      'url',
    );
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    if (!formats.length) {
      const videoUrl = this._html_search_regex(
        /data-video=(["'])(?<url>(?:(?!\1).)+)\1/,
        webpage,
        'video url',
        null,
        false,
        'url',
      );
      if (videoUrl) formats.push({ url: videoUrl, format_id: 'http' });
    }

    const tagsRaw = this._og_search_property('video:tag', webpage, 'tags', false) || '';
    return {
      id: videoId,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      duration: parse_duration(this._html_search_meta('duration', webpage, 'duration')) ?? undefined,
      timestamp: unified_timestamp(this._og_search_property('video:release_date', webpage, 'release date', false)) ?? undefined,
      view_count: int_or_none(this._html_search_meta('interactionCount', webpage, 'view count')) ?? undefined,
      creator: this._og_search_property('video:director', webpage, 'creator', false) ?? undefined,
      tags: tagsRaw ? tagsRaw.split(',') : undefined,
      formats,
    };
  }
}
