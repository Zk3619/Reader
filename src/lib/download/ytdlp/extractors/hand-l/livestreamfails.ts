/**
 * LivestreamfailsIE — ported from yt-dlp livestreamfails.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj, unified_timestamp } from '../../utils';
import { format_field } from './_helpers';

export class LivestreamfailsIE extends InfoExtractor {
  static IE_NAME = 'livestreamfails';
  static _VALID_URL = /https?:\/\/(?:www\.)?livestreamfails\.com\/(?:clip|post)\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiResponse = await this._download_json<Record<string, unknown>>(
      `https://api.livestreamfails.com/clip/${videoId}`,
      videoId,
    );

    const thumb = format_field(apiResponse, 'imageId', 'https://livestreamfails-image-prod.b-cdn.net/image/%s');

    return {
      id: videoId,
      display_id: String(apiResponse.sourceId ?? '') || undefined,
      timestamp: unified_timestamp(apiResponse.createdAt) ?? undefined,
      formats: [{ format_id: 'http', url: `https://livestreamfails-video-prod.b-cdn.net/video/${apiResponse.videoId}` }],
      title: String(apiResponse.label ?? videoId),
      creator: str_or_none(traverse_obj(apiResponse, ['streamer', 'label'])) ?? undefined,
      thumbnail: thumb || undefined,
    };
  }
}
