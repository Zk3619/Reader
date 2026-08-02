/** PornoVoisinesIE — ported from yt-dlp pornovoisines.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, unified_strdate } from '../../utils';

export class PornoVoisinesIE extends InfoExtractor {
  static IE_NAME = 'pornovoisines';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?pornovoisines\.com\/videos\/show\/(?<id>\d+)\/(?<display_id>[^/.]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';

    const settingsUrlResp = await this._download_json<{ video_settings_url?: string }>(
      `http://www.pornovoisines.com/api/video/${videoId}/getsettingsurl/`,
      videoId,
      'Getting settings URL',
    );
    const settings = (
      await this._download_json<{ data?: Record<string, unknown> }>(settingsUrlResp.video_settings_url!, videoId)
    ).data || {};

    const formats: Format[] = [];
    const variants = (settings.variants as Record<string, unknown>) || {};
    if (variants.HLS) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          String(variants.HLS),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
        )),
      );
    }
    if (Array.isArray(variants.MP4)) {
      for (const item of variants.MP4 as Array<Record<string, unknown>>) {
        formats.push({
          url: String(item.url),
          format_id: `mp4-${item.height ?? formats.length}`,
          height: item.height as number | undefined,
          tbr: item.bitrate as number | undefined,
        });
      }
    }

    const webpage = await this._download_webpage(url, videoId);
    const main = (settings.main as Record<string, unknown>) || {};
    const vttTracks = (main.vtt_tracks as Record<string, string>) || {};
    const subtitles: Record<string, Subtitle[]> = {
      fr: Object.values(vttTracks).map((subUrl) => ({ url: subUrl, ext: 'vtt' })),
    };

    const categoriesRaw = this._html_search_regex(
      /Catégories\s*:\s*<b>([\s\S]*?)<\/b>/,
      webpage,
      'categories',
      null,
      false,
    );

    const avgRating = this._search_regex(/Note\s*:\s*(\d+(?:,\d+)?)/, webpage, 'average rating', null, false);

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title: this._og_search_title(webpage) || undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail:
        this._html_search_regex(
          /<img[^>]+class=(['"])thumb\1[^>]*src=(['"])(?<url>[^"]+)\2/,
          webpage,
          'thumbnail',
          'url',
          false,
        ) ?? undefined,
      upload_date: unified_strdate(this._search_regex(/Le\s*<b>([\d/]+)/, webpage, 'upload date', null, false)) ?? undefined,
      duration: main.duration as number | undefined,
      view_count: int_or_none(this._search_regex(/(\d+) vues/, webpage, 'view count', null, false)) ?? undefined,
      average_rating: avgRating ? float_or_none(avgRating.replace(',', '.')) ?? undefined : undefined,
      categories: categoriesRaw ? categoriesRaw.split(',').map((c) => c.trim()) : undefined,
      age_limit: 18,
      subtitles,
    };
  }
}
