/** QDanceIE — ported from yt-dlp qdance.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { jwtDecodePayload } from './_helpers';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export class QDanceIE extends InfoExtractor {
  static IE_NAME = 'qdance';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?q-dance\.com\/network\/(?:library|live)\/(?<id>[\w-]+)/;
  static _NETRC_MACHINE = 'qdance';

  protected async _callLoginApi(data: Record<string, unknown>, note = 'Logging in'): Promise<void> {
    const login = await this._download_json<{ data?: Record<string, string>; error?: Record<string, string> }>(
      'https://members.id-t.com/api/auth/login',
      undefined,
      note,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          brand: 'qdance',
          origin: 'https://www.q-dance.com',
          referer: 'https://www.q-dance.com/',
        },
        data: JSON.stringify(data),
      },
    );
    if (!login.data?.accessToken) {
      const error = [login.error?.code, login.error?.message].filter(Boolean).join(': ');
      if (!error.includes('validation_error')) {
        throw new ExtractorError(`Q-Dance API said "${error}"`, { expected: true });
      }
      throw new ExtractorError('email' in data ? 'Invalid username or password' : 'Refresh token has expired', {
        expected: true,
      });
    }
    accessToken = login.data.accessToken;
    refreshToken = login.data.refreshToken || null;
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    await this._callLoginApi({ email: username, password });
  }

  async _real_initialize(): Promise<void> {
    const cookies = this._get_cookies('https://www.q-dance.com/');
    refreshToken = cookies['_id-t-accounts-refresh'] || null;
    accessToken = cookies['_id-t-accounts-token'] || null;
    if (!accessToken) this.raise_login_required();
  }

  protected _getAuth(): Record<string, string> {
    const exp = jwtDecodePayload(accessToken || '').exp;
    if (typeof exp === 'number' && exp <= Math.floor(Date.now() / 1000) - 120) {
      if (!refreshToken) {
        throw new ExtractorError('Cannot refresh access token, login with yt-dlp or refresh cookies in browser');
      }
      throw new ExtractorError('Access token expired; re-login required');
    }
    return { Authorization: accessToken! };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nuxtMatch = webpage.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    let data: Record<string, unknown> = {};
    if (nuxtMatch?.[1]) {
      try {
        const arr = JSON.parse(nuxtMatch[1]) as unknown[];
        data = (arr[1] as Record<string, unknown>) || {};
      } catch {
        /* ignore */
      }
    }

    const level = int_or_none(traverse_obj(data, ['subscription', 'level'])) || 0;
    const info: VideoInfo = {
      id: videoId,
      title: str_or_none(data.title)?.trim(),
      description: str_or_none(data.description)?.trim(),
      display_id: str_or_none(data.slug) ?? undefined,
      thumbnail: url_or_none(data.thumbnail) ?? undefined,
      duration: int_or_none(data.durationInSeconds) ?? undefined,
      availability: level >= 20 ? 'premium_only' : level >= 15 ? 'subscriber_only' : 'needs_auth',
      is_live: String(data.type || '').toLowerCase() === 'live',
      series: traverse_obj(data, ['event', 'title']) as string | undefined,
      series_id: traverse_obj(data, ['event', 'id']) as string | undefined,
      season: traverse_obj(data, ['eventEdition', 'title']) as string | undefined,
      season_id: traverse_obj(data, ['eventEdition', 'id']) as string | undefined,
      channel_id: traverse_obj(data, ['pubnub', 'channelName']) as string | undefined,
    };

    const stream = await this._download_json<{ data?: { url?: string }; error?: { code?: string } }>(
      `https://dc9h6qmsoymbq.cloudfront.net/api/content/videos/${videoId}/url`,
      videoId,
      undefined,
      { headers: this._getAuth(), fatal: false },
    );
    const m3u8Url = url_or_none(stream.data?.url);
    if (!m3u8Url && stream.error?.code === 'unauthorized') {
      throw new ExtractorError('Your account does not have access to this content', { expected: true });
    }

    const formats: Format[] = m3u8Url
      ? await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)
      : [];
    if (!formats.length) this.raise_no_formats('No active streams found');

    return { ...info, formats };
  }
}
