/** ReverbNationIE — ported from yt-dlp reverbnation.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { str_or_none } from '../../utils';

const THUMBNAILS = ['thumbnail', 'image'] as const;
const THUMB_PREF: Record<string, number> = { thumbnail: 0, image: 1 };

export class ReverbNationIE extends InfoExtractor {
  static IE_NAME = 'ReverbNation';
  static _VALID_URL = /https?:\/\/(?:www\.)?reverbnation\.com\/.*?\/song\/(?<id>\d+).*?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const apiRes = await this._download_json<Record<string, unknown>>(
      `https://api.reverbnation.com/song/${songId}`,
      songId,
      `Downloading information of song ${songId}`,
    );

    const thumbnails: Thumbnail[] = [];
    for (const thumbKey of THUMBNAILS) {
      const thumbUrl = apiRes[thumbKey];
      if (thumbUrl) {
        thumbnails.push({ url: String(thumbUrl), preference: THUMB_PREF[thumbKey] ?? -1 });
      }
    }

    const artist = (apiRes.artist as Record<string, unknown>) || {};

    return {
      id: songId,
      title: apiRes.name as string,
      url: apiRes.url as string,
      uploader: artist.name as string | undefined,
      uploader_id: str_or_none(artist.id) ?? undefined,
      thumbnails,
      ext: 'mp3',
      vcodec: 'none',
    };
  }
}
