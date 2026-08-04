// @ts-nocheck
/** WimbledonIE â€?ported from yt-dlp wimbledon.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, traverse_obj } from '../../utils';

export class WimbledonIE extends InfoExtractor {
  static IE_NAME = 'wimbledon';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wimbledon\.com\/\w+\/video\/media\/(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://www.wimbledon.com/relatedcontent/rest/v2/wim_v1/en/content/wim_v1_${videoId}_en`,
      videoId,
    );

    return {
      _type: 'url_transparent',
      url: `http://players.brightcove.net/3506358525001/default_default/index.html?videoId=${videoId}`,
      ie_key: 'BrightcoveNew',
      id: videoId,
      title: (traverse_obj(metadata, ['title']) as string) || videoId,
      description: (traverse_obj(metadata, ['description']) as string) || undefined,
      duration:
        parse_duration(traverse_obj(metadata, ['metadata', 'duration'])) ?? undefined,
    };
  }
}
