/** RDSIE — ported from yt-dlp rds.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, parse_duration } from '../../utils';
import { parseIso8601 } from './_helpers';

export class RDSIE extends InfoExtractor {
  static IE_NAME = 'RDS';
  static IE_DESC = 'RDS.ca';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rds\.ca\/vid(?:[eé]|%C3%A9)os\/(?:[^/]+\/)*(?<id>[^/]+)-\d+\.\d+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const itemRaw = this._search_regex(/itemToPush\s*=\s*(\{[\s\S]+?\});/, webpage, 'item');
    const item = this._parse_json(itemRaw, displayId, js_to_json) as Record<string, unknown>;
    const videoId = String(item.id);

    const title =
      (item.title as string | undefined) ||
      this._og_search_title(webpage) ||
      this._html_search_meta('title', webpage, 'title') ||
      displayId;
    const description =
      this._og_search_description(webpage) ||
      this._html_search_meta('description', webpage, 'description') ||
      undefined;
    const thumbnail =
      (item.urlImageBig as string | undefined) ||
      this._og_search_thumbnail(webpage) ||
      this._search_regex(
        [
          /<link[^>]+itemprop="thumbnailUrl"[^>]+href="([^"]+)"/,
          /<span[^>]+itemprop="thumbnailUrl"[^>]+content="([^"]+)"/,
        ],
        webpage,
        'thumbnail',
        null,
        false,
      ) ||
      undefined;
    const uploadDateRaw = this._search_regex(
      /<span[^>]+itemprop="uploadDate"[^>]+content="([^"]+)"/,
      webpage,
      'upload date',
      null,
      false,
    );
    const durationRaw = this._search_regex(
      /<span[^>]+itemprop="duration"[^>]+content="([^"]+)"/,
      webpage,
      'duration',
      null,
      false,
    );
    const ageLimitRaw = this._html_search_meta('isFamilyFriendly', webpage, 'age limit', false);
    const ageLimit = ageLimitRaw === 'true' ? 0 : ageLimitRaw === 'false' ? 18 : undefined;

    return {
      _type: 'url_transparent',
      id: videoId,
      display_id: displayId,
      url: `9c9media:rds_web:${videoId}`,
      title,
      description,
      thumbnail,
      timestamp: parseIso8601(uploadDateRaw) ?? undefined,
      duration: parse_duration(durationRaw || undefined) ?? undefined,
      age_limit: ageLimit,
      ie_key: 'NineCNineMedia',
    };
  }
}
