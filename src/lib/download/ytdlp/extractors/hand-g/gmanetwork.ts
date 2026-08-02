/**
 * GMANetworkVideoIE — ported from yt-dlp gmanetwork.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class GMANetworkVideoIE extends InfoExtractor {
  static IE_NAME = 'gmanetworkvideo';
  static _VALID_URL =
    /https?:\/\/(?:www)\.gmanetwork\.com\/(?:\w+\/){3}(?<id>\d+)\/(?<display_id>[\w-]+)\/video/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const contentId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);

    const youtubeId = this._search_regex(
      /var\s*YOUTUBE_VIDEO\s*=\s*['"]+(?<yt_id>[\w-]+)/,
      webpage,
      'youtube_id',
      null,
      false,
      'yt_id',
    );
    if (youtubeId) return this.url_result(youtubeId, 'Youtube', youtubeId);

    const networkUrl = this._search_regex(/NETWORK_URL\s*=\s*['"](?<url>[^'"]+)/, webpage, 'network_url', null, true, 'url')!;
    const jsonData = await this._download_json<Record<string, unknown>>(
      `${networkUrl}api/data/content/video/${contentId}`,
      displayId,
    );
    if (jsonData.video_file) {
      return this.url_result(String(jsonData.video_file), 'Youtube', String(jsonData.video_file));
    }
    return this.url_result(String(jsonData.dailymotion_file), 'Dailymotion', String(jsonData.dailymotion_file));
  }
}
