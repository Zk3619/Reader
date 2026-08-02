/** TenPlayIE — ported from yt-dlp tenplay.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  filter_dict,
  int_or_none,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { jwtIsExpired, urlencodePostdata } from './_helpers';

function appendQuery(url: string, query: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

type LoginInfoGetter = { _get_login_info?: () => [string?, string?] | undefined };

const AUS_AGES: Record<string, number> = {
  G: 0,
  PG: 15,
  M: 15,
  MA: 15,
  'MA15+': 15,
  R: 18,
  X: 18,
};

const SEGMENT_BITRATE_RE = /-(?:300|150|75|55)0000-(\d+(?:-[\da-f]+)?)\.ts$/gm;

function encodeDataUri(data: string, mime: string): string {
  return `data:${mime};base64,${btoa(data)}`;
}

function filterAdsFromM3u8(m3u8Doc: string): string {
  const out: string[] = [];
  for (const line of m3u8Doc.split(/\r?\n/)) {
    if (line.startsWith('https://redirector.googlevideo.com/')) {
      out.pop();
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function generateXnetworkTenAuthToken(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return btoa(ts);
}

export class TenPlayIE extends InfoExtractor {
  static IE_NAME = '10play';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?10(?:play)?\.com\.au\/(?:[^/?#]+\/)+(?<id>tpv\d{6}[a-z]{5})/;
  static _GEO_BYPASS = false;
  static _GEO_COUNTRIES = ['AU'];

  protected _refreshToken: string | null = null;
  protected _accessToken: string | null = null;

  protected async _refreshAccessToken(): Promise<void> {
    try {
      const refreshData = await this._download_json<Record<string, unknown>>(
        'https://10.com.au/api/token/refresh',
        undefined,
        'Refreshing access token',
        {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            accessToken: this._accessToken,
            refreshToken: this._refreshToken,
          }),
        },
      );
      this._accessToken = str_or_none(refreshData.accessToken);
      this._refreshToken = str_or_none(refreshData.refreshToken);
    } catch (e) {
      const err = e as Error & { cause?: { status?: number } };
      if (err.cause?.status === 400) {
        this._refreshToken = this._accessToken = null;
        this.report_warning('Refresh token has been invalidated; retrying with credentials');
        const login = (this as LoginInfoGetter)._get_login_info?.();
        if (login?.[0] && login[1]) await this._perform_login(login[0], login[1]);
        return;
      }
      throw e;
    }
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    if (this._refreshToken && this._accessToken) return;

    try {
      const authData = await this._download_json<Record<string, unknown>>(
        'https://10.com.au/api/user/auth',
        undefined,
        'Logging in',
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Network-Ten-Auth': generateXnetworkTenAuthToken(),
            Referer: 'https://10.com.au/',
          },
          data: JSON.stringify({ email: username, password }),
        },
      );
      const jwt = (authData.jwt as Record<string, unknown>) || {};
      this._refreshToken = str_or_none(jwt.refreshToken);
      this._accessToken = str_or_none(jwt.accessToken);
    } catch (e) {
      const err = e as Error & { cause?: { status?: number } };
      if (err.cause?.status === 400) {
        throw new ExtractorError('Invalid username/password', { expected: true });
      }
      throw e;
    }
  }

  protected async _callPlaybackApi(
    contentId: string,
  ): Promise<[Record<string, unknown>, string | null]> {
    if (this._accessToken && jwtIsExpired(this._accessToken)) {
      await this._refreshAccessToken();
    }
    for (let isRetry = 0; isRetry < 2; isRetry++) {
      try {
        const resp = await this._request_webpage(
          appendQuery(`https://10.com.au/api/v1/videos/playback/${contentId}/`, { platform: 'samsung' }),
          contentId,
          'Downloading video JSON',
          {
            headers: filter_dict({
              'TP-AcceptFeature': 'v1/fw;v1/drm',
              Authorization: this._accessToken ? `Bearer ${this._accessToken}` : undefined,
            }) as Record<string, string>,
          },
        );
        if (!resp) throw new ExtractorError('Empty playback response');
        const videoData = JSON.parse(resp.text) as Record<string, unknown>;
        const authToken =
          resp.headers['x-dai-auth'] || resp.headers['X-Dai-Auth'] || null;
        return [videoData, authToken as string | null];
      } catch (e) {
        const err = e as Error & { cause?: { status?: number } };
        if (!isRetry && err.cause?.status === 403) {
          if (this._accessToken) {
            this.to_screen('Access token has expired; refreshing');
            await this._refreshAccessToken();
            continue;
          }
          this.raise_login_required('Login required to access this video');
        }
        throw e;
      }
    }
    throw new ExtractorError('Playback API failed');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const contentId = this._match_id(url);
    let data: Record<string, unknown>;
    try {
      data = await this._download_json(`https://10.com.au/api/v1/videos/${contentId}`, contentId);
    } catch (e) {
      const err = e as Error & { cause?: { status?: number; body?: string } };
      if (err.cause?.status === 403 && String(err.cause.body || '').includes('Error 54113')) {
        this.raise_geo_restricted(undefined, TenPlayIE._GEO_COUNTRIES);
      }
      throw e;
    }

    const [videoData, authToken] = await this._callPlaybackApi(contentId);
    const dai = (videoData.dai as Record<string, unknown>) || {};
    const contentSourceId = String(dai.contentSourceId || '');
    const videoId = String(dai.videoId || '');
    if (!authToken) throw new ExtractorError('Failed to get DAI auth token');

    const daiData = await this._download_json<Record<string, unknown>>(
      `https://pubads.g.doubleclick.net/ondemand/hls/content/${contentSourceId}/vid/${videoId}/streams`,
      contentId,
      'Downloading DAI JSON',
      { data: urlencodePostdata({ 'auth-token': authToken }) },
    );

    const formats = await this._extract_m3u8_formats(
      String(daiData.stream_manifest || ''),
      contentId,
      'mp4',
      'm3u8_native',
    );

    let m3u8Doc = '';
    let alreadyHave1080p = false;
    for (const fmt of formats) {
      if (!fmt.url) continue;
      m3u8Doc = await this._download_webpage(fmt.url, contentId, 'Downloading m3u8 information');
      m3u8Doc = filterAdsFromM3u8(m3u8Doc);
      fmt.hls_media_playlist_data = m3u8Doc;
      if (fmt.height === 1080) alreadyHave1080p = true;
    }

    if (!alreadyHave1080p && m3u8Doc && SEGMENT_BITRATE_RE.test(m3u8Doc)) {
      m3u8Doc = m3u8Doc.replace(SEGMENT_BITRATE_RE, '-5000000-$1.ts');
      m3u8Doc = m3u8Doc.replace(/-(?:300|150|75|55)0000\.key"/g, '-5000000.key"');
      formats.push({
        format_id: 'upgrade-attempt-1080p',
        url: encodeDataUri(m3u8Doc, 'application/x-mpegurl'),
        hls_media_playlist_data: m3u8Doc,
        width: 1920,
        height: 1080,
        ext: 'mp4',
        protocol: 'm3u8_native',
      });
    }

    const captionUrl = url_or_none(data.captionUrl);
    return {
      id: contentId,
      formats,
      subtitles: captionUrl ? { en: [{ url: captionUrl }] } : undefined,
      uploader: 'Channel 10',
      uploader_id: '2199827728001',
      ...traverse_obj(data, {
        id: ['altId', (v: unknown) => String(v)],
        duration: ['duration', int_or_none],
        title: ['subtitle', (v: unknown) => String(v)],
        alt_title: ['title', (v: unknown) => String(v)],
        description: ['description', (v: unknown) => String(v)],
        age_limit: ['classification', (v: unknown) => AUS_AGES[String(v)] ?? undefined],
        series: ['tvShow', (v: unknown) => String(v)],
        season_number: ['season', int_or_none],
        episode_number: ['episode', int_or_none],
        timestamp: ['published', int_or_none],
        thumbnail: ['imageUrl', url_or_none],
      }),
    };
  }
}
