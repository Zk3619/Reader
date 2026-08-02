/**
 * MTVServicesBaseIE / MTVIE ù?ported from yt-dlp mtv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  jwtDecodePayload,
  jwtIsExpired,
  parseIso8601,
} from './_helpers';

function findVideoDetail(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVideoDetail(item);
      if (found) return found;
    }
    return null;
  }
  const rec = node as Record<string, unknown>;
  if (rec.videoDetail && typeof rec.videoDetail === 'object') {
    return rec.videoDetail as Record<string, unknown>;
  }
  for (const value of Object.values(rec)) {
    const found = findVideoDetail(value);
    if (found) return found;
  }
  return null;
}

function findAuthConfig(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const rec = node as Record<string, unknown>;
  if (rec.authSuiteConfig && typeof rec.authSuiteConfig === 'object') {
    return rec.authSuiteConfig as Record<string, unknown>;
  }
  if (rec.props && typeof rec.props === 'object') {
    const props = rec.props as Record<string, unknown>;
    if (props.authSuiteConfig) return props.authSuiteConfig as Record<string, unknown>;
  }
  for (const value of Object.values(rec)) {
    const found = findAuthConfig(value);
    if (found) return found;
  }
  return null;
}

function findVideoConfig(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const rec = node as Record<string, unknown>;
  if (rec.videoConfig && typeof rec.videoConfig === 'object') {
    return rec.videoConfig as Record<string, unknown>;
  }
  if (rec.props && typeof rec.props === 'object') {
    const props = rec.props as Record<string, unknown>;
    if (props.videoConfig) return props.videoConfig as Record<string, unknown>;
  }
  for (const value of Object.values(rec)) {
    const found = findVideoConfig(value);
    if (found) return found;
  }
  return null;
}

export class MTVServicesBaseIE extends InfoExtractor {
  static IE_NAME = 'mtvservicesbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _ACCESS_TOKEN_KEY = 'access';
  static _REFRESH_TOKEN_KEY = 'refresh';
  static _MEDIA_TOKEN_KEY = 'media';

  protected static _tokenCache: Record<string, Record<string, string>> = {};

  protected _getAuthSuiteData(config: Record<string, unknown>): Record<string, string> {
    return {
      clientId: str_or_none(config.clientId) || '',
      countryCode: str_or_none(config.countryCode) || '',
    };
  }

  protected async _callAuthApi(
    path: string,
    config: Record<string, unknown>,
    displayId?: string,
    note?: string,
    data?: unknown,
    headers: Record<string, string> = {},
    query: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Client-Description': 'deviceName=Chrome Windows;deviceType=desktop;system=Windows NT 10.0',
      'Api-Version': '2025-07-09',
      ...headers,
    };
    let body: string | undefined;
    if (data != null) {
      reqHeaders['Content-Type'] = 'application/json';
      body = typeof data === 'string' ? data : JSON.stringify(data);
    }
    return this._download_json(`https://auth.mtvnservices.com/${path}`, displayId, note || 'Calling authentication API', {
      headers: reqHeaders,
      query: { ...this._getAuthSuiteData(config), ...query },
      data: body,
    });
  }

  protected async _getFreshAccessToken(
    config: Record<string, unknown>,
    displayId?: string,
    forceRefresh = false,
  ): Promise<string> {
    const resourceId = str_or_none(config.resourceId) || 'default';
    const tokens = MTVServicesBaseIE._tokenCache[resourceId] || {};
    MTVServicesBaseIE._tokenCache[resourceId] = tokens;

    const accessToken = tokens[(this.constructor as typeof MTVServicesBaseIE)._ACCESS_TOKEN_KEY];
    if (!forceRefresh && accessToken && !jwtIsExpired(accessToken)) return accessToken;

    const response =
      (this.constructor as typeof MTVServicesBaseIE)._REFRESH_TOKEN_KEY in tokens
        ? await this._callAuthApi(
            'accessToken/refresh',
            config,
            displayId,
            'Refreshing auth tokens',
            { refreshToken: tokens[(this.constructor as typeof MTVServicesBaseIE)._REFRESH_TOKEN_KEY] },
            { Authorization: `Bearer ${accessToken}` },
          )
        : await this._callAuthApi('accessToken', config, displayId, 'Retrieving auth tokens', '');

    tokens[(this.constructor as typeof MTVServicesBaseIE)._ACCESS_TOKEN_KEY] = String(response.applicationAccessToken ?? '');
    tokens[(this.constructor as typeof MTVServicesBaseIE)._REFRESH_TOKEN_KEY] = String(response.deviceRefreshToken ?? '');
    return tokens[(this.constructor as typeof MTVServicesBaseIE)._ACCESS_TOKEN_KEY]!;
  }

  protected async _getMediaToken(
    videoConfig: Record<string, unknown>,
    config: Record<string, unknown>,
    displayId?: string,
  ): Promise<string> {
    const resourceId = str_or_none(config.resourceId) || 'default';
    const tokens = MTVServicesBaseIE._tokenCache[resourceId] || {};
    MTVServicesBaseIE._tokenCache[resourceId] = tokens;

    const mediaToken = tokens[(this.constructor as typeof MTVServicesBaseIE)._MEDIA_TOKEN_KEY];
    if (mediaToken && !jwtIsExpired(mediaToken)) return mediaToken;

    const accessToken = await this._getFreshAccessToken(config, displayId);
    if (!jwtDecodePayload(accessToken).accessMethods) {
      throw new ExtractorError(
        'This video is only available for users of participating TV providers. Use --ap-mso to specify Adobe Pass Multiple-system operator Identifier.',
        { expected: true },
      );
    }

    const content: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(videoConfig)) {
      content[k === 'videoId' ? 'id' : k] = v;
    }

    tokens[(this.constructor as typeof MTVServicesBaseIE)._MEDIA_TOKEN_KEY] = String(
      (
        await this._callAuthApi(
          'mediaToken',
          config,
          displayId,
          'Fetching media token',
          { content, resourceId },
          { Authorization: `Bearer ${accessToken}` },
        )
      ).mediaToken ?? '',
    );
    return tokens[(this.constructor as typeof MTVServicesBaseIE)._MEDIA_TOKEN_KEY]!;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const pageUrl = url.split('?')[0]!;
    let data: Record<string, unknown>;
    try {
      data = await this._download_json(pageUrl, displayId, undefined, { query: { json: 'true' } });
    } catch {
      this.raise_geo_restricted(undefined, ['US']);
      throw new ExtractorError('Geo restricted', { expected: true });
    }

    const videoDetail = findVideoDetail(data);
    if (!videoDetail) throw new ExtractorError('Unable to extract video detail', { expected: true });

    const mgid = str_or_none(videoDetail.mgid) || '';
    const videoId = mgid.split(':').pop() || displayId;
    const serviceUrlRaw = url_or_none(videoDetail.videoServiceUrl);
    if (!serviceUrlRaw) {
      throw new ExtractorError('This content is no longer available', { expected: true });
    }
    const serviceUrl = serviceUrlRaw.split('?')[0]!;

    const headers: Record<string, string> = {};
    if (videoDetail.authRequired) {
      const authConfig = findAuthConfig(data);
      const videoConfig = findVideoConfig(data);
      if (!authConfig || !videoConfig) {
        throw new ExtractorError('Missing auth configuration', { expected: true });
      }
      headers['X-VIA-TVE-MEDIATOKEN'] = await this._getMediaToken(videoConfig, authConfig, displayId);
    }

    const streamResp = await this._download_json<Record<string, unknown>>(serviceUrl, videoId, 'Downloading API JSON', {
      query: { clientPlatform: 'desktop' },
      headers,
    });
    const streamInfo = (streamResp.stitchedstream as Record<string, unknown>) || {};

    const manifestType = str_or_none(streamInfo.manifesttype) || '';
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    if (manifestType === 'hls') {
      const res = await extractM3u8FormatsAndSubtitles(this, String(streamInfo.source ?? ''), videoId, manifestType);
      formats = res.formats;
      subtitles = res.subtitles;
    } else if (manifestType === 'dash') {
      const res = await extractMpdFormatsAndSubtitles(this, String(streamInfo.source ?? ''), videoId, manifestType);
      formats = res.formats;
      subtitles = res.subtitles;
    } else {
      this.raise_no_formats(`Unsupported manifest type "${manifestType}"`);
    }

    const images = (videoDetail.images as Array<Record<string, unknown>>) || [];
    const durationObj = videoDetail.duration as Record<string, unknown> | undefined;
    const publishDate = videoDetail.publishDate as Record<string, unknown> | undefined;
    const airDate = videoDetail.airDate as Record<string, unknown> | undefined;

    return {
      id: videoId,
      display_id: displayId,
      title: str_or_none(videoDetail.title) ?? undefined,
      channel: str_or_none((videoDetail.channel as Record<string, unknown>)?.name) ?? undefined,
      thumbnails: images
        .map((img) => url_or_none(img.url))
        .filter((u): u is string => !!u)
        .map((u) => ({ url: u })),
      description:
        str_or_none(videoDetail.fullDescription) || str_or_none(videoDetail.description) || undefined,
      series: str_or_none((videoDetail.parentEntity as Record<string, unknown>)?.title) ?? undefined,
      season_number: int_or_none(videoDetail.seasonNumber) ?? undefined,
      episode_number: int_or_none(videoDetail.episodeAiringOrder) ?? undefined,
      duration: float_or_none(durationObj?.milliseconds, 1000) ?? undefined,
      timestamp:
        parseIso8601(videoDetail.originalPublishDate) ??
        int_or_none(publishDate?.timestamp) ??
        undefined,
      release_timestamp:
        parseIso8601(videoDetail.originalAirDate) ?? int_or_none(airDate?.timestamp) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class MTVIE extends MTVServicesBaseIE {
  static IE_NAME = 'mtv';
  static _VALID_URL = /https?:\/\/(?:www\.)?mtv\.com\/(?:video-clips|episodes)\/(?<id>[\da-z]{6})/;
}
