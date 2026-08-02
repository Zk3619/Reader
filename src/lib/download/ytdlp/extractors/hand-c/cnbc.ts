/**
 * CNBCVideoIE — ported from yt-dlp cnbc.py
 * `_extract_akamai_formats` is simplified to a direct HLS extraction since
 * the full Akamai HDS/HTTP fallback machinery isn't part of this runtime.
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class CNBCVideoIE extends InfoExtractor {
  static IE_NAME = 'cnbcvideo';
  static _VALID_URL = /https?:\/\/(?:www\.)?cnbc\.com\/video\/(?:[^/?#]+\/)+(?<id>[^./?#&]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const data = this._search_json(/window\.__s_data=/, webpage, 'video data', displayId)!;

    const layouts = (traverse_obj(data, ['page', 'page', 'layout']) as Array<Record<string, unknown>>) || [];
    let playerData: Record<string, unknown> = {};
    outer: for (const layout of layouts) {
      for (const column of (layout.columns as Array<Record<string, unknown>>) || []) {
        for (const module of (column.modules as Array<Record<string, unknown>>) || []) {
          if (module.name === 'clipPlayer') {
            playerData = (module.data as Record<string, unknown>) || {};
            break outer;
          }
        }
      }
    }

    const playbackUrl = (playerData.playbackURL as string) || '';
    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false });

    return {
      ...jsonLd,
      id: displayId,
      display_id: displayId,
      formats: await this._extract_m3u8_formats(playbackUrl, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false),
      title: str_or_none(playerData.title) || (jsonLd.title as string) || undefined,
      description: str_or_none(playerData.description) || undefined,
      creators: Array.isArray(playerData.author)
        ? (playerData.author as Array<Record<string, unknown>>).map((a) => str_or_none(a.name)).filter(Boolean)
        : undefined,
      timestamp: parseIso8601(playerData.datePublished) ?? undefined,
      release_timestamp: parseIso8601(playerData.uploadDate) ?? undefined,
      modified_timestamp: parseIso8601(playerData.dateLastPublished) ?? undefined,
      thumbnail: url_or_none(playerData.thumbnail) || undefined,
      duration: int_or_none(playerData.duration) ?? undefined,
      channel: (traverse_obj(playerData, ['section', 'title']) as string) || undefined,
    } as VideoInfo;
  }
}
