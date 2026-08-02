/**
 * GrouponIE — ported from yt-dlp groupon.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class GrouponIE extends InfoExtractor {
  static IE_NAME = 'groupon';
  static _VALID_URL = /https?:\/\/(?:www\.)?groupon\.com\/deals\/(?<id>[^/?#&]+)/;

  protected _PROVIDERS: Record<string, [string, string]> = {
    youtube: ['%s', 'Youtube'],
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const payload = this._parse_json<Record<string, unknown>>(
      this._search_regex(/(?:var\s+|window\.)payload\s*=\s*(.*?);\n/, webpage, 'payload')!,
      playlistId,
    )!;
    const carousel = (payload.carousel as Record<string, unknown>) || {};
    const videos = (carousel.dealVideos as Array<Record<string, unknown>>) || [];
    const entries: VideoInfo[] = [];

    for (const v of videos) {
      const provider = v.provider as string | undefined;
      const videoId = (v.media as string | undefined) || (v.id as string | undefined) || (v.baseURL as string | undefined);
      if (!provider || !videoId) continue;
      const mapping = this._PROVIDERS[provider.toLowerCase()];
      if (!mapping) {
        this.report_warning(`${playlistId}: Unsupported video provider ${provider}, skipping video`);
        continue;
      }
      const [urlPattern, ieKey] = mapping;
      entries.push(this.url_result(urlPattern.replace('%s', videoId), ieKey));
    }

    return {
      _type: 'playlist',
      id: playlistId,
      entries,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
    };
  }
}
