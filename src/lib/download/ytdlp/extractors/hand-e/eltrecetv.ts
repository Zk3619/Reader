/**
 * ElTreceTVIE — ported from yt-dlp eltrecetv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class ElTreceTVIE extends InfoExtractor {
  static IE_DESC = 'El Trece TV (Argentina)';
  static IE_NAME = 'eltrecetv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?eltrecetv\.com\.ar\/[\w-]+\/capitulos\/temporada-\d+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const webpage = await this._download_webpage(url, slug);
    const content = this._search_json<{ promo_items: { basic: { embed: { config: Record<string, unknown> } } } }>(
      /Fusion\.globalContent\s*=/,
      webpage,
      'content',
      slug,
    )!;
    const config = content.promo_items.basic.embed.config;
    const videoUrl = String(config.m3u8 ?? '');
    const videoId =
      this._search_regex(/\/(\w+)\.m3u8/, videoUrl, 'video id', null, false) || slug;

    const { formats: hlsFormats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      videoUrl,
      videoId,
      'hls',
    );
    const formats: Format[] = [...hlsFormats];
    for (const f of hlsFormats) {
      if (f.url?.endsWith('/tracks-v1a1/index.m3u8') && f.height !== 1080) {
        formats.push({
          url: f.url.slice(0, -23),
          format_id: (f.format_id || 'hls').replace('hls', 'http'),
          width: f.width ?? undefined,
          height: f.height ?? undefined,
        });
      }
    }

    return {
      id: videoId,
      title: (config.title as string) || undefined,
      thumbnail: (config.thumbnail as string) || undefined,
      formats,
      subtitles,
    };
  }
}
