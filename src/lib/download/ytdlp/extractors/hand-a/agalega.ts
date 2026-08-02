/**
 * AGalegaIE — aligned with yt-dlp agalega.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, jwtIsExpired, mergeSubtitles } from './_helpers';

export class AGalegaBaseIE extends InfoExtractor {
  static IE_NAME = 'AGalegaBase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  private static _accessToken: string | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AGalegaBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _refreshAccessToken(videoId: string): Promise<void> {
    const payload = await this._download_json<{ access?: string }>(
      'https://www.agalega.gal/api/fetch-api/jwt/token',
      videoId,
      'Downloading access token',
      {
        data: JSON.stringify({
          username: null,
          password: null,
          client: 'crtvg',
          checkExistsCookies: false,
        }),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    );
    AGalegaBaseIE._accessToken = payload.access || null;
  }

  protected async _callApi(
    endpoint: string,
    displayId: string,
    note: string,
    opts?: { fatal?: boolean; query?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    if (!AGalegaBaseIE._accessToken || jwtIsExpired(AGalegaBaseIE._accessToken)) {
      await this._refreshAccessToken(endpoint);
    }
    return (
      (await this._download_json<Record<string, unknown>>(
        `https://api-agalega.interactvty.com/api/2.0/contents/${endpoint}`,
        displayId,
        note,
        {
          fatal: opts?.fatal,
          query: opts?.query,
          headers: { Authorization: `jwtok ${AGalegaBaseIE._accessToken}` },
        },
      )) || {}
    );
  }
}

export class AGalegaIE extends AGalegaBaseIE {
  static IE_NAME = 'agalega:videos';
  static _VALID_URL = /https?:\/\/(?:www\.)?agalega\.gal\/videos\/(?:detail\/)?(?<id>[0-9]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const contentData = await this._callApi(`content/${videoId}/`, videoId, 'Downloading content data', {
      fatal: false,
      query: {
        optional_fields: 'image,is_premium,short_description,has_subtitle',
      },
    });
    const resourceData = await this._callApi(`content_resources/${videoId}/`, videoId, 'Downloading resource data', {
      query: { optional_fields: 'media_url' },
    });

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const results = (resourceData.results as Record<string, unknown>[]) || [];
    for (const row of results) {
      const m3u8Url = url_or_none(row.media_url);
      if (!m3u8Url) continue;
      const extracted = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      formats.push(...extracted.formats);
      mergeSubtitles(subtitles, extracted.subtitles);
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: traverse_obj(contentData, ['name', { expected_type: String }]) as string | undefined,
      description:
        (traverse_obj(contentData, ['description', { expected_type: String }]) as string | undefined) ||
        (traverse_obj(contentData, ['short_description', { expected_type: String }]) as string | undefined),
      thumbnail: url_or_none(contentData.image) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'agalega:videos',
      extractor_key: 'AGalega',
    };
  }
}
