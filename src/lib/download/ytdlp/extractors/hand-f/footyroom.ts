/**
 * FootyRoomIE â€?ported from yt-dlp footyroom.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

function extractStreamableUrl(payload: string): string | null {
  const m = payload.match(/https?:\/\/(?:www\.)?streamable\.com\/[a-z0-9]+/i);
  return m?.[0] ?? null;
}

export class FootyRoomIE extends InfoExtractor {
  static IE_NAME = 'footyroom';
  static _VALID_URL = /https?:\/\/footyroom\.com\/matches\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const playlist = this._parse_json<unknown[]>(
      this._search_regex(/DataStore\.media\s*=\s*([^;]+)/, webpage, 'media data'),
      playlistId,
    );
    const playlistTitle = this._og_search_title(webpage) || playlistId;

    const entries: VideoInfo[] = [];
    for (const video of playlist || []) {
      if (!video || typeof video !== 'object') continue;
      const payload = (video as Record<string, unknown>).payload;
      if (typeof payload !== 'string') continue;
      const streamableUrl = extractStreamableUrl(payload);
      if (streamableUrl) entries.push(this.url_result(streamableUrl, 'Streamable'));
    }

    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}
