/**
 * Mir24TvIE — ported from yt-dlp mir24tv.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { parse_qs, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, protoRelative } from './_helpers';

export class Mir24TvIE extends InfoExtractor {
  static IE_NAME = 'mir24.tv';
  static _VALID_URL = /https?:\/\/(?:www\.)?mir24\.tv\/news\/(?<id>[0-9]+)\/[^/?#]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const iframeUrl = this._search_regex(
      /<iframe\b[^>]+\bsrc=["'](https?:\/\/mir24\.tv\/players\/[^"']+)["']/,
      webpage,
      'iframe URL',
    )!;
    const qs = parse_qs(iframeUrl);
    const source = qs.source?.slice(-1)[0];
    const m3u8Url = url_or_none(protoRelative(source || ''));
    if (!m3u8Url) throw new Error('m3u8 URL not found');

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');

    return {
      id: videoId,
      title: this._og_search_title(webpage) || htmlExtractTitle(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats,
      subtitles: subtitles as Record<string, Subtitle[]>,
    };
  }
}
