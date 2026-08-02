/**
 * CloudyCDNIE — ported from yt-dlp cloudycdn.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { parseIso8601, urlencodePostdata } from './_helpers';

export class CloudyCDNIE extends InfoExtractor {
  static IE_NAME = 'CloudyCDN';
  static _VALID_URL =
    /(?:https?:)?\/\/embed\.(?<domain>cloudycdn\.services|backscreen\.com)\/(?<site_id>[^/?#]+)\/media\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const siteId = m.groups!.site_id!;
    const videoId = m.groups!.id!;

    const data = await this._download_json<Record<string, unknown>>(
      `https://player.${domain}/player/${siteId}/media/${videoId}/`,
      videoId,
      undefined,
      {
        method: 'POST',
        data: urlencodePostdata({ version: '6.4.0', referer: url }),
      },
    );

    const formats: Format[] = [];
    const source = (data.source as Record<string, unknown>) || {};
    const sources = Array.isArray(source.sources) ? (source.sources as Record<string, unknown>[]) : [];
    for (const src of sources) {
      const m3u8Url = url_or_none(src?.src);
      if (!m3u8Url) continue;
      const fmts = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false);
      for (const fmt of fmts) {
        if (fmt.url && /chunklist_b\d+_vo_/.test(fmt.url)) fmt.acodec = 'none';
      }
      formats.push(...fmts);
    }

    return {
      id: videoId,
      formats,
      title: str_or_none(data.name) ?? undefined,
      duration: int_or_none(data.duration) ?? undefined,
      timestamp: parseIso8601(data.upload_date) ?? undefined,
      thumbnail: url_or_none(source.poster) ?? undefined,
    };
  }
}
