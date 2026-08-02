/**
 * CrtvgIE — ported from yt-dlp crtvg.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_end } from '../../utils';

export class CrtvgIE extends InfoExtractor {
  static IE_NAME = 'crtvg';
  static _VALID_URL = /https?:\/\/(?:www\.)?crtvg\.es\/tvg\/a-carta\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoUrl = this._search_regex(/var\s+url\s*=\s*["']([^"']+)/, webpage, 'video url')!;

    const formats = [
      ...(await this._extract_m3u8_formats(`${videoUrl}/playlist.m3u8`, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false)),
      ...(await this._extract_mpd_formats(`${videoUrl}/manifest.mpd`, videoId, undefined, undefined, false)),
    ];

    const oldIdMatch = videoId.match(/^[^/#?]+-(?<old_id>\d{7})$/);
    const oldArchiveIds = oldIdMatch ? [`${this.ie_key.toLowerCase()} ${oldIdMatch.groups!.old_id}`] : undefined;

    return {
      id: videoId,
      _old_archive_ids: oldArchiveIds,
      formats,
      title: remove_end(this._html_search_meta(['og:title', 'twitter:title'], webpage), ' | CRTVG') || undefined,
      description: this._html_search_meta('description', webpage) || undefined,
      thumbnail: this._html_search_meta(['og:image', 'twitter:image'], webpage) || undefined,
    };
  }
}
