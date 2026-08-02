/**
 * GlideIE — ported from yt-dlp glide.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { protoRelative, genericTitle } from './_helpers';

export class GlideIE extends InfoExtractor {
  static IE_DESC = 'Glide mobile video messages (glide.me)';
  static IE_NAME = 'glide';
  static _VALID_URL = /https?:\/\/share\.glide\.me\/(?<id>[A-Za-z0-9\-=_+]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title = genericTitle(this, '', webpage);
    const videoUrl =
      protoRelative(
        this._search_regex(
          /<source[^>]+src=(["'])(?<url>.+?)\1/,
          webpage,
          'video URL',
          null,
          false,
          'url',
        ) || '',
      ) || this._og_search_video_url(webpage);
    const thumbnail =
      protoRelative(
        this._search_regex(
          /<img[^>]+id=["']video-thumbnail["'][^>]+src=(["'])(?<url>.+?)\1/,
          webpage,
          'thumbnail url',
          null,
          false,
          'url',
        ) || '',
      ) || this._og_search_thumbnail(webpage);

    return {
      id: videoId,
      title,
      url: videoUrl ?? undefined,
      thumbnail: thumbnail ?? undefined,
    };
  }
}
