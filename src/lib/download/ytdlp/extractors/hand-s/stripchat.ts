/** StripchatIE — ported from yt-dlp stripchat.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';

function lowercaseEscape(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export class StripchatIE extends InfoExtractor {
  static IE_NAME = 'stripchat';
  static _VALID_URL = /https?:\/\/stripchat\.com\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId, undefined, {
      headers: this.geo_verification_headers(),
    });
    const data = this._search_json<Record<string, unknown>>(
      /<script\b[^>]*>\s*window\.__PRELOADED_STATE__\s*=/,
      webpage,
      'data',
      videoId,
      { transform_source: lowercaseEscape },
    );
    if (!data) throw new ExtractorError('Unable to extract page data');

    if (traverse_obj(data, ['viewCam', 'show'], { expected_type: 'object' })) {
      throw new ExtractorError('Model is in a private show', { expected: true });
    }
    if (!traverse_obj(data, ['viewCam', 'model', 'isLive'], { expected_type: 'boolean' })) {
      throw new ExtractorError(`${videoId} is offline`, { expected: true });
    }

    const viewCam = data.viewCam as Record<string, unknown>;
    const modelId = (viewCam.model as Record<string, unknown>).id;

    let formats: Format[] = [];
    const configData = traverse_obj(data, [
      ['config', 'data'],
      ['configV3', 'static'],
    ]) as Record<string, unknown>[];
    for (const cfg of configData) {
      const features = (cfg.features as Record<string, unknown>) || {};
      const featuresV2 = features.featuresV2 as Record<string, unknown> | undefined;
      const hlsFallback = (featuresV2?.hlsFallback || features.hlsFallback) as Record<string, unknown> | undefined;
      const hosts = [
        ...(Array.isArray(hlsFallback?.fallbackDomains) ? hlsFallback!.fallbackDomains : []),
        hlsFallback?.hlsStreamHost,
      ].filter(Boolean) as string[];
      for (const host of hosts) {
        formats = await this._extract_m3u8_formats(
          `https://edge-hls.${host}/hls/${modelId}/master/${modelId}_auto.m3u8`,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
          { live: true } as never,
        );
        if (formats.length) break;
      }
      if (formats.length) break;
    }
    if (!formats.length) this.raise_no_formats('Unable to extract stream host', false);

    return {
      id: videoId,
      title: videoId,
      description: this._og_search_description(webpage) || undefined,
      is_live: true,
      formats,
      age_limit: 18,
    };
  }
}
