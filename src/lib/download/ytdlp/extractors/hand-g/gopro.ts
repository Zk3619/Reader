/**
 * GoProIE — ported from yt-dlp gopro.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, remove_end, str_or_none, try_get, unified_timestamp, url_or_none } from '../../utils';

export class GoProIE extends InfoExtractor {
  static IE_NAME = 'gopro';
  static _VALID_URL = /https?:\/\/(?:www\.)?gopro\.com\/v\/(?<id>[A-Za-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const metadata = this._search_json<Record<string, unknown>>(
      /window\.__reflectData\s*=/,
      webpage,
      'metadata',
      videoId,
    )!;
    const videoInfo = ((metadata.collectionMedia as Array<Record<string, unknown>>) || [])[0] || {};
    const mediaData = await this._download_json<Record<string, unknown>>(
      `https://api.gopro.com/media/${videoInfo.id}/download`,
      videoId,
    );

    const formats: Format[] = [];
    for (const fmt of try_get(mediaData, [(x) => x._embedded?.variations as unknown[]], Array.isArray) || []) {
      const f = fmt as Record<string, unknown>;
      const formatUrl = url_or_none(f.url);
      if (!formatUrl) continue;
      formats.push({
        url: formatUrl,
        format_id: str_or_none(f.quality) || 'http',
        format_note: str_or_none(f.label) || undefined,
        ext: str_or_none(f.type) || undefined,
        width: int_or_none(f.width) ?? undefined,
        height: int_or_none(f.height) ?? undefined,
      });
    }

    let title =
      str_or_none(try_get(metadata, [(x) => (x.collection as Record<string, unknown>)?.title as string])) ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
      remove_end(
        this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/, webpage, 'title', null, false, 1) || '',
        ' | GoPro',
      );
    if (title) title = title.replace(/\n/g, ' ');

    return {
      id: videoId,
      title: title || undefined,
      formats,
      thumbnail:
        url_or_none(this._html_search_meta(['og:image', 'twitter:image'], webpage)) ?? undefined,
      timestamp:
        unified_timestamp(
          try_get(metadata, [(x) => (x.collection as Record<string, unknown>)?.created_at]),
        ) ?? undefined,
      uploader_id:
        str_or_none(try_get(metadata, [(x) => (x.account as Record<string, unknown>)?.nickname as string])) ||
        undefined,
      duration: int_or_none(videoInfo.source_duration) ?? undefined,
      artist: str_or_none(videoInfo.music_track_artist) || undefined,
      track: str_or_none(videoInfo.music_track_name) || undefined,
    };
  }
}
