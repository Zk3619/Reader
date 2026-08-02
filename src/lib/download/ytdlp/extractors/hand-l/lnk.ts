/**
 * LnkIE — ported from yt-dlp lnk.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles, format_field, mergeSubtitles } from './_helpers';

export class LnkIE extends InfoExtractor {
  static IE_NAME = 'lnk';
  static _VALID_URL = /https?:\/\/(?:www\.)?lnk\.lt\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._download_json<{ videoInfo?: Record<string, unknown> }>(
      `https://lnk.lt/api/video/video-config/${videoId}`,
      videoId,
    );
    const videoJson = resp.videoInfo || {};

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const srcKey of ['videoUrl', 'videoFairplayUrl'] as const) {
      const src = videoJson[srcKey];
      if (typeof src === 'string' && src && !(srcKey === 'videoFairplayUrl' && videoJson.drm)) {
        const res = await extractM3u8FormatsAndSubtitles(this, src, videoId);
        formats.push(...res.formats);
        subtitles = mergeSubtitles(subtitles, res.subtitles);
      }
    }

    const poster = format_field(videoJson as Record<string, unknown>, 'posterImage', 'https://lnk.lt/all-images/%s');

    return {
      id: videoId,
      title: String(videoJson.title ?? videoId),
      description: videoJson.description != null ? String(videoJson.description) : undefined,
      view_count: int_or_none(videoJson.viewsCount) ?? undefined,
      duration: int_or_none(videoJson.duration) ?? undefined,
      upload_date: unified_strdate(videoJson.airDate) || undefined,
      thumbnail: poster || undefined,
      episode_number: int_or_none(videoJson.episodeNumber) ?? undefined,
      series: videoJson.programTitle != null ? String(videoJson.programTitle) : undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}
