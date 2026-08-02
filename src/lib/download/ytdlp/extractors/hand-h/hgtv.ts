/**
 * HGTVComShowIE — ported from yt-dlp hgtv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class HGTVComShowIE extends InfoExtractor {
  static IE_NAME = 'hgtv.com:show';
  static _VALID_URL = /https?:\/\/(?:www\.)?hgtv\.com\/shows\/[^/]+\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const configRaw = this._search_regex(
      /data-(?:deferred-)?module=["']video["'][^>]*>[\s\S]*?<script[^>]+type=["']text\/x-config["'][^>]*>([\s\S]*?)<\/script>/,
      webpage,
      'video config',
    );
    const configRoot = this._parse_json<{ channels?: Array<Record<string, unknown>> }>(configRaw, displayId);
    const config = (configRoot?.channels?.[0] as Record<string, unknown>) || {};

    const videos = (config.videos as Array<Record<string, unknown>>) || [];
    const entries = videos
      .filter((v) => v.releaseUrl)
      .map((v) => this.url_result(String(v.releaseUrl)));

    return this.playlist_result(entries, displayId, (config.title as string) ?? undefined, (config.description as string) ?? undefined);
  }
}
