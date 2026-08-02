/** TassIE — ported from yt-dlp tass.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json } from '../../utils';
import { qualityRank } from './_helpers';

const SD_HD = qualityRank(['sd', 'hd']);

export class TassIE extends InfoExtractor {
  static IE_NAME = 'tass';
  static _VALID_URL = /https?:\/\/(?:tass\.ru|itar-tass\.com)\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const sourcesRaw = this._search_regex(/sources\s*:\s*(\[[\s\S]+?\])/, webpage, 'sources');
    const sources = this._parse_json<Array<{ file?: string; label?: string }>>(sourcesRaw, videoId, js_to_json)!;

    const formats: Format[] = [];
    for (const source of sources) {
      const videoUrl = source.file;
      if (!videoUrl?.startsWith('http') || !videoUrl.endsWith('.mp4')) continue;
      formats.push({
        url: videoUrl,
        format_id: source.label || 'mp4',
        quality: SD_HD(source.label || ''),
      });
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? videoId,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats,
    };
  }
}
