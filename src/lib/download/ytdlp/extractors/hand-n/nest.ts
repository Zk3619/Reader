/**
 * NestIE / NestClipIE — ported from yt-dlp nest.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, update_url_query, url_or_none } from '../../utils';

export class NestIE extends InfoExtractor {
  static IE_NAME = 'nest';
  static _VALID_URL =
    /https?:\/\/video\.nest\.com\/(?:embedded\/)?live\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._download_json<{ items?: Array<Record<string, unknown>> }>(
      'https://video.nest.com/api/dropcam/cameras.get_by_public_token',
      videoId,
      undefined,
      { query: { token: videoId } },
    );
    const item = resp.items?.[0] || {};
    const uuid = item.uuid as string | undefined;
    const streamDomain = item.live_stream_host as string | undefined;
    if (!streamDomain || !uuid) throw new ExtractorError('Unable to construct playlist URL');

    const thumbDomain = item.nexus_api_nest_domain_host as string | undefined;
    const title =
      (item.title as string) || (item.name as string) || (item.where as string) || undefined;
    const timezone = item.timezone as string | undefined;
    const location =
      (timezone?.split('/')[1]?.replace(/_/g, ' ') as string | undefined) ||
      (item.where as string | undefined);

    return {
      id: videoId,
      description: item.description as string | undefined,
      title,
      alt_title: item.name as string | undefined,
      location,
      thumbnail: thumbDomain
        ? update_url_query(`https://${thumbDomain}/get_image`, { uuid, public: videoId })
        : undefined,
      availability: item.is_public === false ? 'private' : 'public',
      formats: await this._extract_m3u8_formats(
        update_url_query(`https://${streamDomain}/nexus_aac/${uuid}/playlist.m3u8`, { public: videoId }),
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        true,
      ),
      is_live: true,
    };
  }
}

export class NestClipIE extends InfoExtractor {
  static IE_NAME = 'nest:clip';
  static _VALID_URL =
    /https?:\/\/video\.nest\.com\/(?:embedded\/)?clip\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<{ items?: Array<Record<string, unknown>> }>(
      'https://video.nest.com/api/dropcam/videos.get_by_filename',
      videoId,
      undefined,
      { query: { filename: `${videoId}.mp4` } },
    );
    const item = data.items?.[0] || {};
    return {
      id: videoId,
      title: item.title as string | undefined,
      thumbnail: url_or_none(item.thumbnail_url) ?? undefined,
      url: url_or_none(item.download_url) ?? undefined,
      timestamp: float_or_none(item.start_time) ?? undefined,
    };
  }
}
