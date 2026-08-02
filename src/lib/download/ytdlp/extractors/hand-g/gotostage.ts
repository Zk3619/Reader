/**
 * GoToStageIE — ported from yt-dlp gotostage.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { try_get, url_or_none } from '../../utils';

export class GoToStageIE extends InfoExtractor {
  static IE_NAME = 'gotostage';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gotostage\.com\/channel\/[a-z0-9]+\/recording\/(?<id>[a-z0-9]+)\/watch/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = (
      await this._download_json<Array<Record<string, unknown>>>(
        `https://api.gotostage.com/contents?ids=${videoId}`,
        videoId,
        'Downloading video metadata',
      )
    )[0]!;

    const registrationData = {
      product: metadata.product,
      resourceType: metadata.contentType,
      productReferenceKey: metadata.productRefKey,
      firstName: 'foo',
      lastName: 'bar',
      email: 'foobar@example.com',
    };

    const registrationResponse = await this._download_json<{ registrationKey?: string }>(
      'https://api-registrations.logmeininc.com/registrations',
      videoId,
      'Register user',
      {
        data: JSON.stringify(registrationData),
        headers: { 'Content-Type': 'application/json' },
        fatal: false,
      },
    );

    const contentResponse = await this._download_json<Record<string, unknown>>(
      `https://api.gotostage.com/contents/${videoId}/asset`,
      videoId,
      'Get download url',
      { headers: { 'x-registrantkey': registrationResponse.registrationKey || '' } },
    );

    const category = try_get(metadata, [(x) => x.category as string]);
    return {
      id: videoId,
      title: try_get(metadata, [(x) => x.title as string]) || undefined,
      url: try_get(contentResponse, [(x) => x.cdnLocation as string]) || undefined,
      ext: 'mp4',
      thumbnail: url_or_none(try_get(metadata, [(x) => (x.thumbnail as Record<string, unknown>)?.location as string])) ?? undefined,
      duration: try_get(metadata, [(x) => x.duration as number]) ?? undefined,
      categories: category ? [category] : undefined,
      is_live: false,
    };
  }
}
