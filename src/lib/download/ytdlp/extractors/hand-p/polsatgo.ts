/** PolsatGoIE — ported from yt-dlp polsatgo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, try_get, url_or_none } from '../../utils';

export class PolsatGoIE extends InfoExtractor {
  static IE_NAME = 'polsatgo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?polsat(?:box)?go\.pl\/.+\/(?<id>[0-9a-fA-F]+)(?:[/#?]|$)/;

  protected async _callApi(
    endpoint: string,
    mediaId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const randUuid = crypto.randomUUID();
    const res = await this._download_json<{ result?: Record<string, unknown>; error?: Record<string, unknown> }>(
      `https://b2c-mobile.redefine.pl/rpc/${endpoint}/`,
      mediaId,
      `Downloading ${method} JSON metadata`,
      {
        method: 'POST',
        data: JSON.stringify({
          method,
          id: '2137',
          jsonrpc: '2.0',
          params: {
            ...params,
            userAgentData: {
              deviceType: 'mobile',
              application: 'native',
              os: 'android',
              build: 10003,
              widevine: false,
              portal: 'pg',
              player: 'cpplayer',
            },
            deviceId: { type: 'other', value: randUuid },
            clientId: randUuid,
            cpid: 1,
          },
        }),
        headers: { 'Content-type': 'application/json' },
      },
    );
    if (!res.result) {
      const err = res.error || {};
      if (err.code === 13404) {
        throw new ExtractorError('This video is either unavailable in your region or is DRM protected', {
          expected: true,
        });
      }
      const data = (err.data as Record<string, unknown>) || {};
      throw new ExtractorError(`Solorz said: ${err.message} - ${data.userMessage}`);
    }
    return res.result;
  }

  protected async *_extractFormats(
    sources: Array<Record<string, unknown>> | undefined,
    videoId: string,
  ): AsyncGenerator<Format> {
    for (const source of sources || []) {
      if (!source.id) continue;
      const license = await this._callApi('drm', videoId, 'getPseudoLicense', {
        mediaId: videoId,
        sourceId: source.id,
      });
      const url = url_or_none(license.url);
      if (!url) continue;
      const quality = try_get(source, (x) => x.quality) as string | undefined;
      yield {
        url,
        format_id: String(source.id),
        height: int_or_none(quality?.slice(0, -1)),
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const media = (
      await this._callApi('navigation', videoId, 'prePlayData', { mediaId: videoId })
    ).mediaItem as Record<string, unknown>;
    const displayInfo = (media.displayInfo as Record<string, unknown>) || {};
    const playback = (media.playback as Record<string, unknown>) || {};
    const formats: Format[] = [];
    for await (const f of this._extractFormats(
      try_get(playback, (x) => x.mediaSources) as Array<Record<string, unknown>>,
      videoId,
    )) {
      formats.push(f);
    }

    return {
      id: videoId,
      title: String(displayInfo.title ?? ''),
      formats,
      age_limit: int_or_none(displayInfo.ageGroup) ?? undefined,
    };
  }
}
