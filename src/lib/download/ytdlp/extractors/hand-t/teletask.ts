/** TeleTaskIE — ported from yt-dlp teletask.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class TeleTaskIE extends InfoExtractor {
  static IE_NAME = 'teletask';
  static _VALID_URL = /https?:\/\/(?:www\.)?tele-task\.de\/archive\/video\/html5\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const lectureId = this._match_id(url);
    const webpage = await this._download_webpage(url, lectureId);
    const title = this._html_search_regex(/itemprop="name">([^<]+)<\/a>/, webpage, 'title');
    const uploadDate =
      unified_strdate(this._html_search_regex(/Date:<\/td><td>([^<]+)<\/td>/, webpage, 'date', null, false)) ?? undefined;

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/<video class="([^"]+)"[^>]*>\s*<source src="([^"]+)"/g)) {
      entries.push({
        id: `${lectureId}-${m[1]}`,
        url: m[2]!,
        title,
        upload_date: uploadDate,
      });
    }
    return this.playlist_result(entries, lectureId, title);
  }
}
