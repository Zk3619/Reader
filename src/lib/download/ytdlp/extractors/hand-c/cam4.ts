/**
 * CAM4IE — ported from yt-dlp cam4.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class CAM4IE extends InfoExtractor {
  static IE_NAME = 'cam4';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?cam4\.com\/(?<id>[a-z0-9_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const data = await this._download_json<{ cdnURL?: string }>(
      `https://www.cam4.com/rest/v1.0/profile/${channelId}/streamInfo`,
      channelId,
    );

    const formats = await this._extract_m3u8_formats(data.cdnURL!, channelId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');

    return {
      id: channelId,
      title: channelId,
      is_live: true,
      age_limit: 18,
      formats,
      thumbnail: `https://snapshots.xcdnpro.com/thumbnails/${channelId}`,
    };
  }
}
