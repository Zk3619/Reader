/**
 * TweakersIE — ported from yt-dlp tweakers.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, mimetype2ext } from '../../utils';

export class TweakersIE extends InfoExtractor {
  static IE_NAME = 'tweakers';
  static _VALID_URL = /https?:\/\/tweakers\.net\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = (
      await this._download_json<{ items: Record<string, unknown>[] }>(
        `https://tweakers.net/video/s1playlist/${videoId}/1920/1080/playlist.json`,
        videoId,
      )
    ).items[0]!;

    const formats: Format[] = [];
    const progressive = (videoData.locations as Record<string, unknown> | undefined)?.progressive;
    if (Array.isArray(progressive)) {
      for (const location of progressive) {
        if (!location || typeof location !== 'object') continue;
        const loc = location as Record<string, unknown>;
        const formatId = loc.label != null ? String(loc.label) : undefined;
        const width = int_or_none(loc.width) ?? undefined;
        const height = int_or_none(loc.height) ?? undefined;
        for (const source of (loc.sources as unknown[]) || []) {
          if (!source || typeof source !== 'object') continue;
          const src = source as Record<string, unknown>;
          const sourceUrl = src.src != null ? String(src.src) : '';
          if (!sourceUrl) continue;
          formats.push({
            format_id: formatId || 'http',
            url: sourceUrl,
            width,
            height,
            ext: mimetype2ext(src.type != null ? String(src.type) : undefined) || determine_ext(sourceUrl),
          });
        }
      }
    }

    return {
      id: videoId,
      title: String(videoData.title || videoId),
      description: videoData.description != null ? String(videoData.description) : undefined,
      thumbnail: videoData.poster != null ? String(videoData.poster) : undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      uploader_id: videoData.account != null ? String(videoData.account) : undefined,
      formats,
    };
  }
}
