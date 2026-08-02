/**
 * BoxCastVideoIE — aligned with yt-dlp boxcast.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, traverse_obj, unified_timestamp } from '../../utils';

export class BoxCastVideoIE extends InfoExtractor {
  static IE_NAME = 'boxcast';
  static _VALID_URL =
    /https?:\/\/boxcast\.tv\/(?:view-embed\/|channel\/\w+\?(?:[^#]+&)?b=|video-portal\/(?:\w+\/){2})(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const webpageJsonData =
      this._search_json<Record<string, unknown>>(
        /var\s*BOXCAST_PRELOAD\s*=/,
        webpage,
        'broadcast data',
        displayId,
        { transform_source: js_to_json, default: {} },
      ) || {};

    const broadcastJsonData =
      ((traverse_obj(webpageJsonData, ['broadcast', 'data']) as Record<string, unknown>) ||
        (await this._download_json<Record<string, unknown>>(
          `https://api.boxcast.com/broadcasts/${displayId}`,
          displayId,
        ))) ?? {};
    const viewJsonData =
      ((traverse_obj(webpageJsonData, ['view', 'data']) as Record<string, unknown>) ||
        (await this._download_json<Record<string, unknown>>(
          `https://api.boxcast.com/broadcasts/${displayId}/view`,
          displayId,
          undefined,
          { fatal: false },
        ))) ?? {};

    let formats: Format[] = [];
    const subtitles: Record<string, never> = {};
    if (viewJsonData.status === 'recorded' && viewJsonData.playlist) {
      formats = await this._extract_m3u8_formats(String(viewJsonData.playlist), displayId);
    }

    return {
      id: String(broadcastJsonData.id ?? displayId),
      title:
        (broadcastJsonData.name as string) ||
        this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
        displayId,
      description:
        (broadcastJsonData.description as string) ||
        this._html_search_meta(['og:description', 'twitter:description'], webpage) ||
        null,
      thumbnail:
        (broadcastJsonData.preview as string) ||
        this._html_search_meta(['og:image', 'twitter:image'], webpage) ||
        undefined,
      formats,
      subtitles,
      release_timestamp: unified_timestamp(broadcastJsonData.streamed_at) ?? undefined,
      uploader: (broadcastJsonData.account_name as string) || undefined,
      uploader_id: broadcastJsonData.account_id != null ? String(broadcastJsonData.account_id) : undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'boxcast',
      extractor_key: 'BoxCastVideo',
    };
  }
}
