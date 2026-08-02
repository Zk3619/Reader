/**
 * BigoIE — aligned with yt-dlp bigo.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { urlencodePostdata, UserNotLive } from './_helpers';

export class BigoIE extends InfoExtractor {
  static IE_NAME = 'bigo';
  static _VALID_URL = /https?:\/\/(?:www\.)?bigo\.tv\/(?:[a-z]{2,}\/)?(?<id>[^/]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);

    const infoRaw = await this._download_json<Record<string, unknown>>(
      'https://ta.bigo.tv/official_website/studio/getInternalStudioInfo',
      userId,
      undefined,
      {
        method: 'POST',
        data: urlencodePostdata({ siteId: userId }),
        headers: { Accept: 'application/json' },
      },
    );

    if (!infoRaw || typeof infoRaw !== 'object') {
      throw new ExtractorError('Received invalid JSON data');
    }
    if (infoRaw.code) {
      throw new ExtractorError(`Bigo says: ${infoRaw.msg} (code ${infoRaw.code})`, { expected: true });
    }
    const info = (infoRaw.data as Record<string, unknown>) || {};

    if (!info.alive) {
      throw new UserNotLive(userId);
    }

    const formats = await this._extract_m3u8_formats(
      String(info.hls_src || ''),
      userId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'm3u8',
    );

    return {
      id: String(info.roomId || userId),
      title: String(info.roomTopic || info.nick_name || userId),
      formats,
      thumbnail: info.snapshot ? String(info.snapshot) : undefined,
      uploader: info.nick_name ? String(info.nick_name) : undefined,
      uploader_id: userId,
      is_live: true,
      webpage_url: url,
      original_url: url,
      extractor: 'bigo',
      extractor_key: 'Bigo',
    };
  }
}
