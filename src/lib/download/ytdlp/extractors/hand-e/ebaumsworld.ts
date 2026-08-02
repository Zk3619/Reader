/**
 * EbaumsWorldIE — ported from yt-dlp ebaumsworld.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class EbaumsWorldIE extends InfoExtractor {
  static IE_NAME = 'ebaumsworld';
  static _VALID_URL = /https?:\/\/(?:www\.)?ebaumsworld\.com\/videos\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const config = await this._download_webpage(
      `http://www.ebaumsworld.com/video/player/${videoId}`,
      videoId,
    );
    const videoUrl = this._search_regex(/<file>([^<]+)<\/file>/, config, 'file')!;

    return {
      id: videoId,
      title: this._search_regex(/<title>([^<]+)<\/title>/, config, 'title') ?? undefined,
      url: videoUrl,
      description: this._search_regex(/<description>([^<]+)<\/description>/, config, 'description', null, false) ?? undefined,
      thumbnail: this._search_regex(/<image>([^<]+)<\/image>/, config, 'image', null, false) ?? undefined,
      uploader: this._search_regex(/<username>([^<]+)<\/username>/, config, 'username', null, false) ?? undefined,
    };
  }
}
