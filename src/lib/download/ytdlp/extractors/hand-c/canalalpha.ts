/**
 * CanalAlphaIE — ported from yt-dlp canalalpha.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, dict_get, int_or_none, unified_strdate, url_or_none } from '../../utils';

export class CanalAlphaIE extends InfoExtractor {
  static IE_NAME = 'CanalAlpha';
  static _VALID_URL = /https?:\/\/(?:www\.)?canalalpha\.ch\/play\/[^/]+\/[^/]+\/(?<id>\d+)\/?.*/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const raw = this._search_regex(
      /window\.__SERVER_STATE__\s?=\s?({(?:(?!};)[^"]|"([^"]|\\")*")+})\s?;/,
      webpage,
      'data_json',
    )!;
    const parsed = this._parse_json<Record<string, unknown>>(raw, videoId)!;
    const wrapper = (parsed['1'] as Record<string, unknown>) || {};
    const dataJson = (((wrapper.data as Record<string, unknown>) || {}).data as Record<string, unknown>) || {};

    const video = (dataJson.video as Record<string, unknown>) || {};
    const manifests = (video.manifests as Record<string, unknown>) || {};
    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};

    const formats: Format[] = [];
    const mp4List = Array.isArray(video.mp4) ? (video.mp4 as Record<string, unknown>[]) : [];
    for (const item of mp4List) {
      const itemUrl = item?.$url as string | undefined;
      if (!itemUrl) continue;
      const res = (item.res as Record<string, unknown>) || {};
      formats.push({
        url: itemUrl,
        ext: 'mp4',
        width: int_or_none(res.width) ?? undefined,
        height: int_or_none(res.height) ?? undefined,
        format_id: 'mp4',
      });
    }

    const hlsUrl = manifests.hls as string | undefined;
    if (hlsUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    const dashUrl = manifests.dash as string | undefined;
    if (dashUrl) {
      formats.push(...(await this._extract_mpd_formats(dashUrl, videoId, 'dash', undefined, false)));
    }

    return {
      id: videoId,
      title: String(dataJson.title ?? '').trim(),
      description: clean_html(dict_get(dataJson, ['longDesc', 'shortDesc']) as string | null) ?? undefined,
      thumbnail: url_or_none(dataJson.poster) ?? undefined,
      upload_date:
        unified_strdate(dict_get(dataJson, ['webPublishAt', 'featuredAt', 'diffusionDate'])) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      formats,
      subtitles,
    };
  }
}
