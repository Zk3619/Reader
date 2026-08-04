// @ts-nocheck
/** UOLIE â€?ported from yt-dlp uol.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_duration,
  update_url_query,
} from '../../utils';
import { parseIso8601, qualities } from './_helpers';

export class UOLIE extends InfoExtractor {
  static IE_NAME = 'uol.com.br';
  static _VALID_URL =
    /https?:\/\/(?:.+?\.)?uol\.com\.br\/.*?(?:(?:mediaId|v)=|view\/(?:[a-z0-9]+\/)?|video(?:=|\/(?:\d{4}\/\d{2}\/\d{2}\/)?))(?<id>\d+|[\w-]+-[A-Z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const videoData = (
      await this._download_json<{ item: Record<string, unknown> }>(
        `https://api.mais.uol.com.br/apiuol/v3/media/detail/${videoId}`,
        videoId,
      )
    ).item;
    const mediaId = String(videoData.mediaId);
    const title = String(videoData.title || mediaId);
    const ver = videoData.revision ?? 2;

    const uolFormats = await this._download_json<Record<string, unknown>>(
      `https://croupier.mais.uol.com.br/v3/formats/${mediaId}/jsonp`,
      mediaId,
    );
    const quality = qualities(['mobile', 'WEBM', '360p', '720p', '1080p']);
    const formats: Format[] = [];

    for (const [formatId, f] of Object.entries(uolFormats)) {
      if (!f || typeof f !== 'object') continue;
      const fmt = f as Record<string, unknown>;
      const fUrl = (fmt.url || fmt.secureUrl) as string | undefined;
      if (!fUrl) continue;
      const query: Record<string, string | number> = {
        ver: ver as string | number,
        r: 'http://mais.uol.com.br',
      };
      for (const k of ['token', 'sign'] as const) {
        const v = fmt[k];
        if (v) query[k] = String(v);
      }
      const resolvedUrl = update_url_query(fUrl, query);
      if (formatId === 'HLS') {
        const m3u8Formats = await this._extract_m3u8_formats(
          resolvedUrl,
          mediaId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
        const encodedQuery = new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, String(v)]),
        ).toString();
        for (const m3u8F of m3u8Formats) {
          m3u8F.extra_param_to_segment_url = encodedQuery;
          m3u8F.url = update_url_query(m3u8F.url, query);
        }
        formats.push(...m3u8Formats);
        continue;
      }
      formats.push({
        format_id: formatId,
        url: resolvedUrl,
        quality: quality(formatId),
      });
    }

    const tags: string[] = [];
    for (const tag of (videoData.tags as Array<Record<string, unknown>>) || []) {
      const tagDescription = tag.description as string | undefined;
      if (tagDescription) tags.push(tagDescription);
    }

    const thumbnails: Thumbnail[] = [];
    for (const q of ['Small', 'Medium', 'Wmedium', 'Large', 'Wlarge', 'Xlarge']) {
      const qUrl = videoData[`thumb${q}`] as string | undefined;
      if (!qUrl) continue;
      thumbnails.push({ id: q, url: qUrl });
    }

    return {
      id: mediaId,
      title,
      description: clean_html(videoData.description as string) || undefined,
      thumbnails,
      duration: parse_duration(videoData.duration) ?? undefined,
      tags,
      formats,
      timestamp: parseIso8601(videoData.publishDate, { delimiter: ' ' }) ?? undefined,
      view_count: int_or_none(videoData.viewsQtty) ?? undefined,
    };
  }
}
