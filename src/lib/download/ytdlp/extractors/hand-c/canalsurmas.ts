/**
 * CanalsurmasIE — ported from yt-dlp canalsurmas.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, float_or_none, url_or_none } from '../../utils';
import { jwtDecodePayload, parseIso8601 } from './_helpers';

export class CanalsurmasIE extends InfoExtractor {
  static IE_NAME = 'canalsurmas';
  static _VALID_URL = /https?:\/\/(?:www\.)?canalsurmas\.es\/videos\/(?<id>\d+)/;

  private static _API_BASE = 'https://api-rtva.interactvty.com';
  private static _accessToken: string | null = null;

  private static _isJwtExpired(token: string): boolean {
    const exp = jwtDecodePayload(token).exp;
    return typeof exp !== 'number' || exp - Date.now() / 1000 < 300;
  }

  private async _callApi(
    endpoint: string,
    videoId: string,
    fields?: string[],
  ): Promise<Record<string, unknown>> {
    if (!CanalsurmasIE._accessToken || CanalsurmasIE._isJwtExpired(CanalsurmasIE._accessToken)) {
      const tokenResp = await this._download_json<{ access: string }>(
        `${CanalsurmasIE._API_BASE}/jwt/token/`,
        undefined,
        'Downloading access token',
        {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          data: JSON.stringify({ username: 'canalsur_demo', password: 'dsUBXUcI' }),
        },
      );
      CanalsurmasIE._accessToken = tokenResp.access;
    }

    return this._download_json(
      `${CanalsurmasIE._API_BASE}/api/2.0/contents/${endpoint}/${videoId}/`,
      videoId,
      `Downloading ${endpoint} API JSON`,
      {
        headers: { Authorization: `jwtok ${CanalsurmasIE._accessToken}` },
        query: fields ? { optional_fields: fields.join(',') } : undefined,
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._callApi('content', videoId, [
      'description',
      'image',
      'duration',
      'created_at',
      'tags',
    ]);
    const streamInfo = await this._callApi('content_resources', videoId, ['media_url']);

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const results = (streamInfo.results as Array<Record<string, unknown>>) || [];
    for (const r of results) {
      const streamUrl = url_or_none(r.media_url);
      if (!streamUrl) continue;
      if (determine_ext(streamUrl) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({ url: streamUrl, format_id: 'http' });
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: String(videoInfo.name || '').trim() || undefined,
      description: (videoInfo.description as string) || undefined,
      thumbnail: url_or_none(videoInfo.image) || undefined,
      duration: float_or_none(videoInfo.duration) ?? undefined,
      timestamp: parseIso8601(videoInfo.created_at) ?? undefined,
      tags: Array.isArray(videoInfo.tags) ? (videoInfo.tags as string[]) : undefined,
    };
  }
}
