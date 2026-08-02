/**
 * APAIE — aligned with yt-dlp apa.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, url_or_none } from '../../utils';

export class APAIE extends InfoExtractor {
  static IE_NAME = 'apa';
  static _VALID_URL =
    /(?<base_url>https?:\/\/[^/]+\.apa\.at)\/embed\/(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? m[2] ?? '';
    const baseUrl = m.groups?.base_url ?? m[1] ?? '';

    const webpage = await this._download_webpage(`${baseUrl}/player/${videoId}`, videoId);

    const jwplatformId = this._search_regex(
      /media[iI]d\s*:\s*["'](?<id>[a-zA-Z0-9]{8})/,
      webpage,
      'jwplatform id',
      null,
      false,
      'id',
    );
    if (jwplatformId) {
      return this.url_result(`jwplatform:${jwplatformId}`, 'JWPlatform', videoId);
    }

    const extractField = (field: string): string | null =>
      this._search_regex(
        new RegExp(`\\b${field}["']\\s*:\\s*(["'])(?<value>(?:(?!\\1).)+)\\1`),
        webpage,
        field,
        null,
        false,
        'value',
      );

    const title = extractField('title') || videoId;
    const description = extractField('description');
    const thumbnail = extractField('poster') || extractField('thumbnail');

    const formats: Format[] = [];
    for (const formatId of ['hls', 'progressive'] as const) {
      const sourceUrl = url_or_none(extractField(formatId));
      if (!sourceUrl) continue;
      const ext = determine_ext(sourceUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(sourceUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        const height = int_or_none(this._search_regex(/(\d+)\.mp4/, sourceUrl, 'height', null, false));
        formats.push({ url: sourceUrl, format_id: formatId, height: height ?? undefined });
      }
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail: thumbnail || undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'apa',
      extractor_key: 'APA',
    };
  }
}
