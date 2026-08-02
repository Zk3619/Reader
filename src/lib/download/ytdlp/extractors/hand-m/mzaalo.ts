/**
 * MzaaloIE — ported from yt-dlp mzaalo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { parse_duration, str_or_none, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parse_age_limit } from './_helpers';

export class MzaaloIE extends InfoExtractor {
  static IE_NAME = 'mzaalo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mzaalo\.com\/(?:play|watch)\/(?<type>movie|original|clip)\/(?<id>[a-f0-9-]+)\/[\w-]+/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const type = (m.groups?.type ?? '').toLowerCase();
    const path =
      type === 'clip'
        ? `partner/streamurl?&assetId=${videoId}&getClipDetails=YES`
        : `api/v2/player/details?assetType=${type.toUpperCase()}&assetId=${videoId}`;

    const response = await this._download_json<{ data: Record<string, unknown> }>(
      `https://production.mzaalo.com/platform/${path}`,
      videoId,
      undefined,
      {
        headers: { 'Ocp-Apim-Subscription-Key': '1d0caac2702049b89a305929fdf4cbae' },
      },
    );
    const data = response.data || {};

    const { formats: hlsFormats } = await extractM3u8FormatsAndSubtitles(
      this,
      String(data.streamURL ?? ''),
      videoId,
    );
    const lang = str_or_none(data.language)?.toLowerCase();
    const formats: Format[] = hlsFormats.map((f) => ({ ...f, language: lang ?? f.language }));

    const subtitles: Record<string, Subtitle[]> = {};
    const subs = data.subtitles as Record<string, string> | undefined;
    if (subs && typeof subs === 'object') {
      for (const [subsLang, subsUrl] of Object.entries(subs)) {
        if (url_or_none(subsUrl)) {
          subtitles[subsLang] = [{ url: subsUrl, ext: 'vtt' }];
        }
      }
    }

    const images = ((data.images as Array<{ url?: string }>) || [])
      .map((img) => url_or_none(img.url))
      .filter(Boolean) as string[];

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(data.title) ?? undefined,
      description: str_or_none(data.description) ?? undefined,
      duration: parse_duration(data.duration) ?? undefined,
      age_limit: parse_age_limit(str_or_none(data.maturity_rating)),
      thumbnails: images.map((u) => ({ url: u })),
      categories: ((data.genre as unknown[]) || []).map((g) => str_or_none(g)).filter(Boolean) as string[],
    };
  }
}
