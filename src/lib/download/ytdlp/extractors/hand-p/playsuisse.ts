/** PlaySuisseIE — ported from yt-dlp playsuisse.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, parse_qs, str_or_none, update_url_query } from '../../utils';
import { urlencodePostdata } from './_helpers';

const GRAPHQL_QUERY = `
query AssetWatch($assetId: ID!) {
  assetV2(id: $assetId) {
    id name description descriptionLong year contentTypes directors mainCast productionCountries
    duration episodeNumber seasonNumber seriesName
    medias { type url }
    thumbnail16x9 { url } thumbnail2x3 { url }
  }
  episodes { id name description descriptionLong year contentTypes directors mainCast productionCountries duration episodeNumber seasonNumber seriesName medias { type url } thumbnail16x9 { url } }
}`;

export class PlaySuisseIE extends InfoExtractor {
  static IE_NAME = 'playsuisse';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?playsuisse\.ch\/(?:watch|detail)\/(?:[^#]*[?&]episodeId=)?(?<id>[0-9]+)/;
  static _NETRC_MACHINE = 'playsuisse';
  static _CLIENT_ID = '1e33f1bf-8bf3-45e4-bbd9-c9ad934b5fca';
  static _LOGIN_BASE = 'https://account.srgssr.ch';
  static _ID_TOKEN: string | null = null;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const codeVerifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const authUrl = `${PlaySuisseIE._LOGIN_BASE}/authz-srv/authz?${new URLSearchParams({
      client_id: PlaySuisseIE._CLIENT_ID,
      redirect_uri: 'https://www.playsuisse.ch/auth',
      scope: 'email profile openid offline_access',
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      view_type: 'login',
    }).toString()}`;
    const authResp = await this._request_webpage(authUrl, undefined, 'Requesting session ID');
    if (!authResp) throw new ExtractorError('Login failed: no auth response', { expected: true });
    const requestId = parse_qs(authResp.url).requestId?.[0];
    if (!requestId) throw new ExtractorError('Login failed: no requestId', { expected: true });

    let exchangeId: string;
    try {
      exchangeId = (
        await this._download_json<{ data?: { exchange_id?: { exchange_id?: string } } }>(
          `${PlaySuisseIE._LOGIN_BASE}/verification-srv/v2/authenticate/initiate/password`,
          undefined,
          'Submitting username',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            data: JSON.stringify({
              usage_type: 'INITIAL_AUTHENTICATION',
              request_id: requestId,
              medium_id: 'PASSWORD',
              type: 'password',
              identifier: username,
            }),
          },
        )
      ).data?.exchange_id?.exchange_id!;
    } catch {
      throw new ExtractorError('Invalid username', { expected: true });
    }

    let loginData: Record<string, unknown>;
    try {
      loginData = (
        await this._download_json<{ data?: Record<string, unknown> }>(
          `${PlaySuisseIE._LOGIN_BASE}/verification-srv/v2/authenticate/authenticate/password`,
          undefined,
          'Submitting password',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            data: JSON.stringify({ requestId, exchange_id: exchangeId, type: 'password', password }),
          },
        )
      ).data || {};
    } catch {
      throw new ExtractorError('Invalid password', { expected: true });
    }

    const exchange = (loginData.exchange_id as Record<string, unknown>) || {};
    const loginResp = await this._request_webpage(
      {
        url: `${PlaySuisseIE._LOGIN_BASE}/login-srv/verification/login`,
        data: urlencodePostdata({
          requestId,
          exchange_id: String(exchange.exchange_id ?? ''),
          verificationType: 'password',
          sub: String(loginData.sub ?? ''),
          status_id: String(loginData.status_id ?? ''),
          rememberMe: 'true',
          lat: '',
          lon: '',
        }),
      },
      undefined,
      'Logging in',
    );
    if (!loginResp) throw new ExtractorError('Login failed', { expected: true });
    const code = parse_qs(loginResp.url).code?.[0];
    if (!code) throw new ExtractorError('Login failed', { expected: true });

    PlaySuisseIE._ID_TOKEN = (
      await this._download_json<{ id_token?: string }>(
        `${PlaySuisseIE._LOGIN_BASE}/proxy/token`,
        undefined,
        'Downloading token',
        {
          method: 'POST',
          query: {
            client_id: PlaySuisseIE._CLIENT_ID,
            redirect_uri: 'https://www.playsuisse.ch/auth',
            code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
          },
        },
      )
    ).id_token || null;
    if (!PlaySuisseIE._ID_TOKEN) throw new ExtractorError('Login failed', { expected: true });
  }

  protected async _getMediaData(mediaId: string, locale?: string): Promise<Record<string, unknown>> {
    const response = await this._download_json<{ data?: { assetV2?: Record<string, unknown> } }>(
      'https://www.playsuisse.ch/api/graphql',
      mediaId,
      undefined,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', locale: locale || 'de' },
        data: JSON.stringify({
          operationName: 'AssetWatch',
          query: GRAPHQL_QUERY,
          variables: { assetId: mediaId },
        }),
      },
    );
    return response.data?.assetV2 || {};
  }

  protected async _extractSingle(mediaData: Record<string, unknown>): Promise<VideoInfo> {
    const thumbnails = Object.entries(mediaData)
      .filter(([k]) => k.startsWith('thumbnail'))
      .map(([, v]) => (v as Record<string, unknown>)?.url)
      .filter(Boolean)
      .map((u) => ({ url: String(u) }));

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const media of (mediaData.medias as Array<Record<string, unknown>>) || []) {
      if (media.type !== 'HLS' || !media.url) continue;
      const hlsUrl = update_url_query(String(media.url), { id_token: PlaySuisseIE._ID_TOKEN! });
      formats.push(
        ...(await this._extract_m3u8_formats(
          hlsUrl,
          String(mediaData.id ?? ''),
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'HLS',
          undefined,
          false,
        )),
      );
    }

    const episodeNum = int_or_none(mediaData.episodeNumber);
    return {
      id: String(mediaData.id ?? ''),
      title: str_or_none(mediaData.name) ?? undefined,
      description: str_or_none(mediaData.descriptionLong) || str_or_none(mediaData.description) || undefined,
      genres: (mediaData.contentTypes as string[]) || undefined,
      creators: (mediaData.directors as string[]) || undefined,
      cast: (mediaData.mainCast as string[]) || undefined,
      location: ((mediaData.productionCountries as string[]) || []).join('; ') || undefined,
      release_year: mediaData.year ? int_or_none(String(mediaData.year).slice(0, 4)) ?? undefined : undefined,
      duration: int_or_none(mediaData.duration) ?? undefined,
      series: str_or_none(mediaData.seriesName) ?? undefined,
      season_number: int_or_none(mediaData.seasonNumber) ?? undefined,
      episode: episodeNum != null ? str_or_none(mediaData.name) ?? undefined : undefined,
      episode_number: episodeNum ?? undefined,
      thumbnails,
      formats,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    if (!PlaySuisseIE._ID_TOKEN) this.raise_login_required(undefined, undefined, 'password');
    const mediaId = this._match_id(url);
    const locale = parse_qs(url).locale?.[0];
    const mediaData = await this._getMediaData(mediaId, locale);
    const info = await this._extractSingle(mediaData);
    const episodes = mediaData.episodes as Array<Record<string, unknown>> | undefined;
    if (episodes?.length) {
      const entries: VideoInfo[] = [];
      for (const ep of episodes) entries.push(await this._extractSingle(ep));
      return this.playlist_result(entries, info.id, info.title);
    }
    return info;
  }
}
