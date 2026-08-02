/** TheWeatherChannelIE — ported from yt-dlp theweatherchannel.py */

import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, parse_duration, str_or_none } from '../../utils';
import { ThePlatformBaseIE, ThePlatformIE } from './theplatform';

function parseIso8601(v: unknown): number | null {
  if (v == null) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? Math.trunc(ms / 1000) : null;
}

export class TheWeatherChannelIE extends ThePlatformBaseIE {
  static IE_NAME = 'theweatherchannel';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?weather\.com(?<asset_name>(?:\/(?<locale>[a-z]{2}-[A-Z]{2}))?\/(?:[^/]+\/)*video\/(?<id>[^/?#]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const assetName = m.groups!.asset_name!;
    const locale = m.groups!.locale || 'en-US';
    const displayId = m.groups!.id!;

    const response = await this._download_json<Record<string, unknown>>(
      'https://weather.com/api/v1/p/redux-dal',
      displayId,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify([
          {
            name: 'getCMSAssetsUrlConfig',
            params: {
              language: locale.replace('-', '_'),
              query: { assetName: { $in: assetName } },
            },
          },
        ]),
      },
    );

    const config = (response.dal as Record<string, unknown>)?.getCMSAssetsUrlConfig as Record<
      string,
      { data: Array<Record<string, unknown>> }
    >;
    const item = Object.values(config || {})[0]!.data[0]!;
    const videoId = String(item.id);
    const seoMeta = (item.seometa as Record<string, unknown>) || {};
    const title = str_or_none(item.title) || str_or_none(seoMeta.title) || displayId;

    const urls: string[] = [];
    const thumbnails: Thumbnail[] = [];
    const formats: Format[] = [];

    for (const [variantId, variantUrlRaw] of Object.entries(
      (item.variants as Record<string, string>) || {},
    )) {
      const variantUrl = variantUrlRaw.trim();
      if (!variantUrl || urls.includes(variantUrl)) continue;
      urls.push(variantUrl);
      const ext = determine_ext(variantUrl);
      if (ext === 'jpg') {
        thumbnails.push({ url: variantUrl, id: variantId });
      } else if (ThePlatformIE.suitable(variantUrl)) {
        const { formats: tpFormats } = await this._extractTheplatformSmil(variantUrl, videoId);
        formats.push(...tpFormats);
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            variantUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            variantId,
            undefined,
            false,
          )),
        );
      } else {
        formats.push({ url: variantUrl, format_id: variantId });
      }
    }

    const ccUrl = str_or_none(item.cc_url);
    return {
      id: videoId,
      display_id: displayId,
      title,
      description:
        str_or_none(item.description) ||
        str_or_none(seoMeta.description) ||
        str_or_none(seoMeta['og:description']) ||
        undefined,
      duration: parse_duration(item.duration) ?? undefined,
      uploader: str_or_none(item.providername) ?? undefined,
      uploader_id: str_or_none(item.providerid) ?? undefined,
      timestamp: parseIso8601(item.publishdate) ?? undefined,
      subtitles: ccUrl ? { [locale.slice(0, 2)]: [{ url: ccUrl, ext: 'vtt' }] } : undefined,
      thumbnails: thumbnails.length ? thumbnails : undefined,
      formats,
    };
  }
}
