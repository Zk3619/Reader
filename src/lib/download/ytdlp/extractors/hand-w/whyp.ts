// @ts-nocheck
/** WhypIE â€?ported from yt-dlp whyp.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, url_or_none } from '../../utils';
import { parseIso8601, searchNuxtData } from './_helpers';

export class WhypIE extends InfoExtractor {
  static IE_NAME = 'Whyp';
  static _VALID_URL = /https?:\/\/(?:www\.)?whyp\.it\/tracks\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const uniqueId = this._match_id(url);
    const webpage = await this._download_webpage(url, uniqueId);
    const data = (searchNuxtData(this, webpage, uniqueId).rawTrack || {}) as Record<
      string,
      unknown
    >;

    const formats: Format[] = [];
    for (const prefix of ['audio', 'lossy', 'lossless'] as const) {
      const u = url_or_none(data[`${prefix}_url`]);
      if (!u) continue;
      formats.push({
        url: u,
        format_id: prefix,
        filesize: int_or_none(data[`${prefix}_size`]) ?? undefined,
        vcodec: 'none',
        quality: prefix === 'lossless' ? 10 : -1,
        http_headers: { Referer: 'https://whyp.it/' },
      });
    }

    const user = (data.user as Record<string, unknown> | undefined) || {};

    return {
      id: uniqueId,
      formats,
      title: (data.title as string) || uniqueId,
      display_id: (data.slug as string) || undefined,
      description: data.description != null ? String(data.description) : undefined,
      duration: float_or_none(data.duration) ?? undefined,
      timestamp: parseIso8601(data.created_at) ?? undefined,
      uploader: (user.username as string) || undefined,
      uploader_id: str_or_none(user.id) || undefined,
      thumbnail: url_or_none(data.artwork_url) || undefined,
    };
  }
}
