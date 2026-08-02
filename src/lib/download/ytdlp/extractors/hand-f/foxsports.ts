/**
 * FoxSportsIE ??ported from yt-dlp foxsports.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, smuggle_url } from '../../utils';

export class FoxSportsIE extends InfoExtractor {
  static IE_NAME = 'foxsports';
  static _VALID_URL = /https?:\/\/(?:www\.)?foxsports\.com\/watch\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonLd = this._search_json_ld(webpage, videoId, { expected_type: 'VideoObject', fatal: false });
    const data = await this._download_json<Record<string, unknown>>(
      `https://api3.fox.com/v2.0/vodplayer/sportsclip/${videoId}`,
      videoId,
      'Downloading API JSON',
      {
        headers: { 'x-api-key': 'cf289e299efdfa39fb6316f259d1de93' },
      },
    );

    const preplayUrl = String(data.url ?? '');

    return {
      _type: 'url_transparent',
      ie_key: 'UplynkPreplay',
      id: videoId,
      url: smuggle_url(preplayUrl, { Origin: 'https://www.foxsports.com' }),
      display_id: videoId,
      title: (data.name as string | undefined) || (jsonLd.title as string | undefined),
      description: (data.description as string | undefined) || (jsonLd.description as string | undefined),
      duration: float_or_none(data.durationInSeconds) ?? undefined,
      timestamp: jsonLd.timestamp as number | undefined,
      thumbnails: jsonLd.thumbnails as VideoInfo['thumbnails'],
    };
  }
}
