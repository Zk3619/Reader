/**
 * InaIE — ported from yt-dlp ina.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class InaIE extends InfoExtractor {
  static IE_NAME = 'ina';
  static _VALID_URL = /https?:\/\/(?:(?:www|m)\.)?ina\.fr\/(?:[^?#]+\/)(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const apiUrl = this._html_search_regex(
      /asset-details-url\s*=\s*["'](?<api_url>[^"']+)/,
      webpage,
      'api_url',
      undefined,
      true,
      'api_url',
    )!;
    const assetId = this._search_regex(/assets\/([^?/]+)/, apiUrl, 'asset_id')!;

    const apiResponse = await this._download_json<Record<string, unknown>>(
      apiUrl.replace(assetId, `${assetId}.json`),
      assetId,
    );

    const mediaType = apiResponse.type as string | undefined;
    return {
      id: assetId,
      url: apiResponse.resourceUrl as string,
      ext: mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : undefined,
      title: apiResponse.title as string | undefined,
      description: apiResponse.description as string | undefined,
      upload_date: unified_strdate(apiResponse.dateOfBroadcast) ?? undefined,
      duration: apiResponse.duration as number | undefined,
      thumbnail: apiResponse.resourceThumbnail as string | undefined,
    };
  }
}
