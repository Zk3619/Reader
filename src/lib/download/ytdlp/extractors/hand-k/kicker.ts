/**
 * KickerIE — ported from yt-dlp kicker.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { htmlExtractTitle } from './_helpers';

export class KickerIE extends InfoExtractor {
  static IE_NAME = 'kicker';
  static _VALID_URL = /https?:\/\/(?:www\.)kicker\.(?:de)\/(?<id>[\w-]+)\/video/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoSlug = this._match_id(url);
    const webpage = await this._download_webpage(url, videoSlug);
    const dailymotionVideoId = this._search_regex(
      /data-dmprivateid\s*=\s*['"](?<video_id>\w+)/,
      webpage,
      'video id',
      null,
      true,
      'video_id',
    )!;

    return this.url_result(
      `https://www.dailymotion.com/video/${dailymotionVideoId}`,
      'Dailymotion',
      dailymotionVideoId,
      htmlExtractTitle(webpage) ?? undefined,
    );
  }
}
