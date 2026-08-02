/** RedBee* — ported from yt-dlp redbee.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, strip_or_none } from './_helpers';

export class RedBeeBaseIE extends InfoExtractor {
  static IE_NAME = 'RedBeeBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _DEVICE_ID = `${Date.now()}-${Math.random()}`;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RedBeeBaseIE is not a standalone extractor', { expected: true });
  }

  protected get _API_URL(): string {
    const cls = this.constructor as typeof RedBeeBaseIE & { _REDBEE_CUSTOMER?: string; _REDBEE_BUSINESS_UNIT?: string };
    return `https://exposure.api.redbee.live/v2/customer/${cls._REDBEE_CUSTOMER}/businessunit/${cls._REDBEE_BUSINESS_UNIT}`;
  }

  protected async _getBearerToken(assetId: string, jwt?: string): Promise<string> {
    const request: Record<string, unknown> = {
      deviceId: RedBeeBaseIE._DEVICE_ID,
      device: { deviceId: RedBeeBaseIE._DEVICE_ID, name: 'Mozilla Firefox 102', type: 'WEB' },
    };
    if (jwt) request.jwt = jwt;
    const resp = await this._download_json<{ sessionToken?: string }>(
      `${this._API_URL}/auth/${jwt ? 'gigyaLogin' : 'anonymous'}`,
      assetId,
      undefined,
      { data: JSON.stringify(request), headers: { 'Content-Type': 'application/json;charset=utf-8' } },
    );
    return resp.sessionToken!;
  }

  protected async _getFormatsAndSubtitles(assetId: string, jwt?: string) {
    const bearerToken = await this._getBearerToken(assetId, jwt);
    const apiResponse = await this._download_json<{ formats?: Array<Record<string, unknown>> }>(
      `${this._API_URL}/entitlement/${assetId}/play`,
      assetId,
      undefined,
      { headers: { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json, text/plain, */*' } },
    );
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const formatData of apiResponse.formats || []) {
      const mediaLocator = formatData.mediaLocator as string | undefined;
      if (!mediaLocator) continue;
      const fmt = String(formatData.format || '');
      let fmts: Format[] = [];
      let subs: Record<string, Subtitle[]> = {};
      if (fmt === 'HLS') {
        const res = await extractM3u8FormatsAndSubtitles(this, mediaLocator, assetId);
        fmts = res.formats;
        subs = res.subtitles;
      } else if (fmt === 'DASH') {
        fmts = await this._extract_mpd_formats(mediaLocator, assetId, 'dash', undefined, false);
      }
      if (formatData.drm) for (const f of fmts) (f as Record<string, unknown>).has_drm = true;
      formats.push(...fmts);
      mergeSubtitles(subtitles, subs);
    }
    return { formats, subtitles };
  }
}

export class ParliamentLiveUKIE extends RedBeeBaseIE {
  static IE_NAME = 'parliamentlive.tv';
  static IE_DESC = 'UK parliament videos';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?parliamentlive\.tv\/Event\/Index\/(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/i;
  static _REDBEE_CUSTOMER = 'UKParliament';
  static _REDBEE_BUSINESS_UNIT = 'ParliamentLive';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const { formats, subtitles } = await this._getFormatsAndSubtitles(videoId);
    const videoInfo = await this._download_json<Record<string, unknown>>(
      `https://www.parliamentlive.tv/Event/GetShareVideo/${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );
    const event = videoInfo.event as Record<string, unknown> | undefined;
    return {
      id: videoId,
      formats,
      subtitles,
      title: event?.title as string | undefined,
      thumbnail: videoInfo.thumbnailUrl as string | undefined,
      timestamp: unified_timestamp(event?.publishedStartTime as string) ?? undefined,
    };
  }
}

export class RTBFIE extends RedBeeBaseIE {
  static IE_NAME = 'RTBF';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rtbf\.be\/(?:video\/[^?]+\?.*\bid=|ouftivi\/(?:[^/]+\/)*[^?]+\?.*\bvideoId=|auvio\/[^/]+\?.*\b(?:l)?id=)(?<id>\d+)/;
  static _NETRC_MACHINE = 'rtbf';
  static _REDBEE_CUSTOMER = 'RTBF';
  static _REDBEE_BUSINESS_UNIT = 'Auvio';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const { formats, subtitles } = await this._getFormatsAndSubtitles(videoId);
    const meta = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://bff-service.rtbf.be/auvio/v1.23/media/${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );
    const data = meta.data || {};
    return {
      id: videoId,
      formats,
      subtitles,
      title: strip_or_none(data.title as string) ?? undefined,
      description: strip_or_none(data.description as string) ?? undefined,
      duration: float_or_none(data.duration as number) ?? undefined,
      timestamp: unified_timestamp(data.publishedFrom as string) ?? undefined,
    };
  }
}
