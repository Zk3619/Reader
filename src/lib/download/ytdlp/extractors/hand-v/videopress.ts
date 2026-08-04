// @ts-nocheck
/** VideoPressIE â€?ported from yt-dlp videopress.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  unified_timestamp,
} from '../../utils';
import { parse_age_limit, qualities, urljoin } from './_helpers';

function randomBirthday(
  yearKey: string,
  monthKey: string,
  dayKey: string,
): Record<string, string> {
  return {
    [yearKey]: String(1950 + Math.floor(Math.random() * 50)),
    [monthKey]: String(1 + Math.floor(Math.random() * 12)),
    [dayKey]: String(1 + Math.floor(Math.random() * 28)),
  };
}

export class VideoPressIE extends InfoExtractor {
  static IE_NAME = 'videopress';
  static _ID_REGEX = /[\da-zA-Z]{8}/;
  static _PATH_REGEX = /video(?:\.word)?press\.com\/embed\//;
  static _VALID_URL = /https?:\/\/video(?:\.word)?press\.com\/embed\/(?<id>[\da-zA-Z]{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const query: Record<string, string> = {
      ...randomBirthday('birth_year', 'birth_month', 'birth_day'),
      fields:
        'description,duration,file_url_base,files,height,original,poster,rating,title,upload_date,width',
    };

    const video = await this._download_json<Record<string, unknown>>(
      `https://public-api.wordpress.com/rest/v1.1/videos/${videoId}`,
      videoId,
      undefined,
      { query },
    );

    const title = String(video.title || videoId);
    const fileUrlBase = (video.file_url_base as Record<string, string> | undefined) || {};
    const baseUrl = fileUrlBase.https || fileUrlBase.http;

    const QUALITIES = ['std', 'dvd', 'hd'] as const;
    const quality = qualities([...QUALITIES]);

    const formats: Format[] = [];
    for (const [formatId, f] of Object.entries((video.files as Record<string, unknown>) || {})) {
      if (!f || typeof f !== 'object') continue;
      for (const [ext, path] of Object.entries(f as Record<string, unknown>)) {
        if (ext !== 'mp4' && ext !== 'ogg') continue;
        const joined = baseUrl ? urljoin(baseUrl, String(path)) : String(path);
        if (!joined) continue;
        formats.push({
          url: joined,
          format_id: `${formatId}-${ext}`,
          ext: determine_ext(String(path), ext),
          quality: quality(formatId),
        });
      }
    }

    const originalUrl = video.original as string | undefined;
    if (originalUrl) {
      formats.push({
        url: originalUrl,
        format_id: 'original',
        quality: QUALITIES.length,
        width: int_or_none(video.width) ?? undefined,
        height: int_or_none(video.height) ?? undefined,
      });
    }

    return {
      id: videoId,
      title,
      description: (video.description as string) || undefined,
      thumbnail: (video.poster as string) || undefined,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      timestamp: unified_timestamp(video.upload_date) ?? undefined,
      age_limit: parse_age_limit(video.rating as string) ?? undefined,
      formats,
    };
  }
}
