/**
 * MuseAIIE — ported from yt-dlp museai.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  js_to_json,
  str_or_none,
  url_or_none,
} from '../../utils';

export class MuseAIIE extends InfoExtractor {
  static IE_NAME = 'museai';
  static _VALID_URL = /https?:\/\/(?:www\.)?muse\.ai\/(?:v|embed)\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://muse.ai/embed/${videoId}`, videoId);
    const data = this._search_json<Record<string, unknown>>(
      /player\.setData\(/,
      webpage,
      'player data',
      videoId,
      { transform_source: js_to_json },
    )!;

    const sourceUrl = str_or_none(data.url);
    if (!url_or_none(sourceUrl)) {
      throw new ExtractorError('Unable to extract video URL', { expected: true });
    }

    const formats: Format[] = [
      {
        url: sourceUrl!,
        format_id: 'source',
        quality: 1,
        ext: determine_ext(str_or_none(data.filename) || sourceUrl!),
        width: int_or_none(data.width) ?? undefined,
        height: int_or_none(data.height) ?? undefined,
        filesize: int_or_none(data.size) ?? undefined,
      },
    ];

    if (sourceUrl!.endsWith('/data')) {
      const baseUrl = `${sourceUrl!.slice(0, -5)}/videos`;
      formats.push(
        ...(await this._extract_m3u8_formats(`${baseUrl}/hls.m3u8`, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        ...(await this._extract_mpd_formats(`${baseUrl}/dash.mpd`, videoId, 'dash', undefined, false)),
      );
    }

    const mature = data.mature;
    const visibility = str_or_none(data.visibility);

    return {
      id: videoId,
      formats,
      title: str_or_none(data.title) ?? undefined,
      description: str_or_none(data.description) ?? undefined,
      duration: float_or_none(data.duration) ?? undefined,
      timestamp: int_or_none(data.tcreated) ?? undefined,
      uploader: str_or_none(data.owner_name) ?? undefined,
      uploader_id: str_or_none(data.owner_username) ?? undefined,
      view_count: int_or_none(data.views) ?? undefined,
      age_limit: mature ? 18 : undefined,
      availability:
        visibility === 'private' || visibility === 'unlisted' ? visibility : 'public',
    };
  }
}
