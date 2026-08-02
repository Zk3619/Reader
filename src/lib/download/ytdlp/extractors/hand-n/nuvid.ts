/** NuvidIE — ported from yt-dlp nuvid.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_duration, url_or_none } from '../../utils';
import { strip_or_none } from './_helpers';

export class NuvidIE extends InfoExtractor {
  static IE_NAME = 'Nuvid';
  static _VALID_URL = /https?:\/\/(?:www|m)\.nuvid\.com\/video\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = await this._download_json<Record<string, unknown>>(
      `https://www.nuvid.com/player_config_json/?vid=${videoId}&aid=0&domain_id=0&embed=0&check_speed=0`,
      videoId,
      undefined,
      {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      },
    );

    const webpage =
      (await this._download_webpage(`http://m.nuvid.com/video/${videoId}`, videoId, undefined, {
        fatal: false,
      })) || '';

    const qualities: Record<string, string> = { lq: '360p', hq: '720p' };
    const title =
      strip_or_none(videoData.title) ||
      this._html_search_regex(
        /<span[^>]*title\s*=\s*["']([^"']+)/i,
        webpage,
        'title',
        null,
        false,
      ) ||
      videoId;

    const files = (videoData.files as Record<string, string>) || {};
    const formats: Format[] = Object.entries(files)
      .filter(([, src]) => src)
      .map(([quality, source]) => ({
        url: source,
        format_id: qualities[quality] || quality,
        height: int_or_none(qualities[quality]?.slice(0, -1)) ?? undefined,
      }));

    const duration =
      parse_duration(String(videoData.duration ?? videoData.duration_format ?? '')) ?? undefined;
    const thumbnails: Thumbnail[] = [];
    for (const m of webpage.matchAll(/<div\s+class\s*=\s*"video-tmb-wrap"\s*>\s*<img\s+src\s*=\s*"([^"]+)"\s*\/>/g)) {
      if (url_or_none(m[1])) thumbnails.push({ url: m[1]! });
    }
    if (url_or_none(videoData.poster)) {
      thumbnails.push({ url: String(videoData.poster), preference: 1 });
    }

    return { id: videoId, formats, title, thumbnails, duration, age_limit: 18 };
  }
}
