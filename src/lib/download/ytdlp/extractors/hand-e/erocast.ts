/**
 * ErocastIE — ported from yt-dlp erocast.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class ErocastIE extends InfoExtractor {
  static IE_NAME = 'erocast';
  static _VALID_URL = /https?:\/\/(?:www\.)?erocast\.me\/track\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const data = this._search_json<Record<string, unknown>>(
      new RegExp(`<script>\\s*var song_data_${videoId}\\s*=`),
      webpage,
      'data',
      videoId,
    )!;

    const streamUrl = url_or_none(data.file_url) || url_or_none(data.stream_url);
    const formats = streamUrl
      ? await this._extract_m3u8_formats(streamUrl, videoId, 'm4a', 'm3u8_native', undefined, undefined, 'hls')
      : [];

    return {
      id: videoId,
      formats,
      age_limit: 18,
      title: str_or_none(traverse_obj(data, ['title'])) ?? undefined,
      description: str_or_none(traverse_obj(data, ['description'])) ?? undefined,
      release_timestamp: parseIso8601(traverse_obj(data, ['created_at'])) ?? undefined,
      modified_timestamp: parseIso8601(traverse_obj(data, ['updated_at'])) ?? undefined,
      uploader: str_or_none(traverse_obj(data, ['user', 'name'])) ?? undefined,
      uploader_id: str_or_none(traverse_obj(data, ['user', 'id'])) ?? undefined,
      uploader_url: url_or_none(traverse_obj(data, ['user', 'permalink_url'])) ?? undefined,
      thumbnail: url_or_none(traverse_obj(data, ['artwork_url'])) ?? undefined,
      duration: int_or_none(traverse_obj(data, ['duration'])) ?? undefined,
      view_count: int_or_none(traverse_obj(data, ['plays'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(data, ['comment_count'])) ?? undefined,
      webpage_url: url_or_none(traverse_obj(data, ['permalink_url'])) ?? undefined,
    };
  }
}
