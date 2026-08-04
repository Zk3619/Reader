// @ts-nocheck
/** WeiqiTVIE â€?ported from yt-dlp weiqitv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class WeiqiTVIE extends InfoExtractor {
  static IE_NAME = 'WeiqiTV';
  static IE_DESC = 'WQTV';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?weiqitv\.com\/index\/video_play\?videoId=(?<id>[A-Za-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const page = await this._download_webpage(url, mediaId);

    const infoJsonStr = this._search_regex(/var\s+video\s*=\s*(.+});/, page, 'info json str')!;
    const infoJson = this._parse_json<Record<string, unknown>>(infoJsonStr, mediaId)!;

    const letvcloudUrl = this._search_regex(
      /var\s+letvurl\s*=\s*"([^"]+)/,
      page,
      'letvcloud url',
    )!;

    return {
      _type: 'url_transparent',
      ie_key: 'LetvCloud',
      url: letvcloudUrl,
      title: String(infoJson.name || mediaId),
      id: mediaId,
    };
  }
}
