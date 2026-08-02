/** TeleMBIE — ported from yt-dlp telemb.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { remove_start } from '../../utils';

export class TeleMBIE extends InfoExtractor {
  static IE_NAME = 'telemb';
  static _VALID_URL = /https?:\/\/(?:www\.)?telemb\.be\/(?<display_id>.+?)_d_(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);

    const formats: Format[] = [];
    for (const videoUrl of [...webpage.matchAll(/file\s*:\s*"([^"]+)"/g)].map((x) => x[1]!)) {
      const fmt: Format = { url: videoUrl, format_id: videoUrl.split(':')[0] || 'http' };
      const rtmp = videoUrl.match(/^(?<url>rtmp:\/\/[^/]+\/(?<app>.+))\/(?<playpath>mp4:.+)$/);
      if (rtmp?.groups) {
        Object.assign(fmt, {
          play_path: rtmp.groups.playpath,
          app: rtmp.groups.app,
          player_url: 'http://p.jwpcdn.com/6/10/jwplayer.flash.swf',
          page_url: 'http://www.telemb.be',
          preference: -10,
        });
      }
      formats.push(fmt);
    }

    return {
      id: videoId,
      display_id: displayId,
      title: remove_start(this._og_search_title(webpage) || '', 'TéléMB : '),
      description:
        this._html_search_regex(/<meta property="og:description" content="(.+?)" \/>/, webpage, 'description', null, false) ??
        undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats,
    };
  }
}
