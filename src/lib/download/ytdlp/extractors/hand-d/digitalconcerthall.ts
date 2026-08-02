/**
 * DigitalConcertHallIE — ported from yt-dlp digitalconcerthall.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, url_or_none } from '../../utils';
import { jwtDecodePayload, urlencodePostdata } from './_helpers';

const LOGIN_HINT =
  'Use --username token --password ACCESS_TOKEN where ACCESS_TOKEN is access_token_production from browser local storage';
const REFRESH_HINT = 'or use --username refresh --password REFRESH_TOKEN';

export class DigitalConcertHallIE extends InfoExtractor {
  static IE_NAME = 'digitalconcerthall';
  static IE_DESC = 'DigitalConcertHall extractor';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?digitalconcerthall\.com\/(?<language>[a-z]+)\/(?<type>film|concert|work)\/(?<id>[0-9]+)-?(?<part>[0-9]+)?/;
  static _NETRC_MACHINE = 'digitalconcerthall';

  private static _accessToken: string | null = null;
  private static _accessTokenExpiry = 0;
  private static _refreshToken: string | null = null;

  private static _OAUTH_URL = 'https://api.digitalconcerthall.com/v2/oauth2/token';
  private static _CLIENT_ID = 'dch.webapp';
  private static _CLIENT_SECRET = '2ySLN+2Fwb';
  private static _USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  private static _OAUTH_HEADERS: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    Origin: 'https://www.digitalconcerthall.com',
    Referer: 'https://www.digitalconcerthall.com/',
    'User-Agent': DigitalConcertHallIE._USER_AGENT,
  };

  private get accessTokenExpired(): boolean {
    return DigitalConcertHallIE._accessTokenExpiry - 30 <= Math.floor(Date.now() / 1000);
  }

  private setAccessToken(value: string | null): void {
    DigitalConcertHallIE._accessToken = value;
    if (value) {
      const payload = jwtDecodePayload(value);
      DigitalConcertHallIE._accessTokenExpiry = int_or_none(payload.exp) ?? 0;
    } else {
      DigitalConcertHallIE._accessTokenExpiry = 0;
    }
  }

  protected async performLogin(username: string, password: string): Promise<void> {
    if (username === 'refresh') {
      DigitalConcertHallIE._refreshToken = password;
      await this.fetchNewTokens();
    } else if (username === 'token') {
      try {
        jwtDecodePayload(password);
      } catch {
        throw new ExtractorError(`The access token passed to yt-dlp is not valid. ${LOGIN_HINT}`, { expected: true });
      }
      this.setAccessToken(password);
    } else if (username !== 'cache') {
      throw new ExtractorError(
        `Login with username and password is no longer supported for this site. ${LOGIN_HINT}, ${REFRESH_HINT}`,
        { expected: true },
      );
    }
  }

  private async fetchNewTokens(invalidate = false): Promise<void> {
    if (invalidate) {
      this.report_warning('Access token has been invalidated');
      this.setAccessToken(null);
    }
    if (!this.accessTokenExpired) return;

    if (!DigitalConcertHallIE._refreshToken) {
      this.setAccessToken(null);
      throw new ExtractorError(
        `Access token has expired or been invalidated. Get a new access_token_production value. ${REFRESH_HINT}`,
        { expected: true },
      );
    }

    let bearer = DigitalConcertHallIE._accessToken;
    if (!bearer) {
      const initial = await this._download_json<{ access_token: string }>(
        DigitalConcertHallIE._OAUTH_URL,
        undefined,
        'Obtaining initial token',
        {
          data: urlencodePostdata({
            affiliate: 'none',
            grant_type: 'device',
            device_vendor: 'unknown',
            device_model: 'unknown',
            app_id: DigitalConcertHallIE._CLIENT_ID,
            app_distributor: 'berlinphil',
            app_version: '1.95.0',
            client_secret: DigitalConcertHallIE._CLIENT_SECRET,
          }),
          method: 'POST',
          headers: DigitalConcertHallIE._OAUTH_HEADERS,
        },
      );
      bearer = initial.access_token;
    }

    const response = await this._download_json<{ access_token: string; refresh_token?: string }>(
      DigitalConcertHallIE._OAUTH_URL,
      undefined,
      'Refreshing token',
      {
        data: urlencodePostdata({
          grant_type: 'refresh_token',
          refresh_token: DigitalConcertHallIE._refreshToken,
          client_id: DigitalConcertHallIE._CLIENT_ID,
          client_secret: DigitalConcertHallIE._CLIENT_SECRET,
        }),
        method: 'POST',
        headers: { ...DigitalConcertHallIE._OAUTH_HEADERS, Authorization: `Bearer ${bearer}` },
      },
    );
    this.setAccessToken(response.access_token);
    if (response.refresh_token) DigitalConcertHallIE._refreshToken = response.refresh_token;
  }

  private ensureAuth(): void {
    if (!DigitalConcertHallIE._accessToken) {
      this.raise_login_required(
        `All content on this site is only available for registered users. ${LOGIN_HINT}, ${REFRESH_HINT}`,
        null,
        null,
      );
    }
  }

  private protoRelative(u: string): string {
    return u.startsWith('//') ? `https:${u}` : u;
  }

  private async *entryItems(
    items: Record<string, unknown>[],
    language: string,
    type: string,
    extra: Record<string, unknown>,
  ): AsyncGenerator<VideoInfo> {
    for (const item of items) {
      const videoId = String(item.id ?? '');
      const links = (item._links as Record<string, unknown>) || {};
      const streams = (links.streams as Record<string, unknown>) || {};
      const href = this.protoRelative(String(streams.href ?? ''));

      await this.fetchNewTokens(false);
      const streamInfo = await this._download_json<Record<string, unknown>>(href, videoId, undefined, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${DigitalConcertHallIE._accessToken}`,
          'Accept-Language': language,
          'User-Agent': DigitalConcertHallIE._USER_AGENT,
        },
      });

      const formats: Format[] = [];
      const channels = Array.isArray(streamInfo.channel) ? streamInfo.channel : [];
      for (const ch of channels) {
        if (!ch || typeof ch !== 'object') continue;
        const streamsArr = Array.isArray((ch as Record<string, unknown>).stream)
          ? ((ch as Record<string, unknown>).stream as Record<string, unknown>[])
          : [];
        for (const st of streamsArr) {
          const fmtUrl = url_or_none((st as Record<string, unknown>).url);
          if (!fmtUrl) continue;
          const ext = determine_ext(fmtUrl);
          if (ext === 'm3u8') {
            formats.push(
              ...(await this._extract_m3u8_formats(fmtUrl, videoId, 'mp4', 'm3u8', undefined, undefined, 'hls', undefined, false)),
            );
          } else if (ext === 'mpd') {
            formats.push(...(await this._extract_mpd_formats(fmtUrl, videoId, 'dash', undefined, false)));
          }
        }
      }

      const cuepoints = Array.isArray(item.cuepoints) ? item.cuepoints : [];
      yield {
        id: videoId,
        title: (item.title as string) ?? undefined,
        composer: (item.name_composer as string) ?? undefined,
        formats,
        duration: int_or_none(item.duration_total) ?? undefined,
        timestamp: int_or_none((item.date as Record<string, unknown>)?.published) ?? undefined,
        description: (item.short_description as string) || (streamInfo.short_description as string) || undefined,
        ...extra,
        chapters:
          type === 'concert' && cuepoints.length
            ? cuepoints.map((ch) => {
                const c = ch as Record<string, unknown>;
                const start = int_or_none(c.time) ?? 0;
                const dur = int_or_none(c.duration) ?? 0;
                return { start_time: start, end_time: start + dur, title: (c.text as string) ?? undefined };
              })
            : undefined,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    this.ensureAuth();
    const m = this._match_valid_url(url)!;
    const language = m.groups!.language || 'en';
    const type = m.groups!.type!;
    const videoId = m.groups!.id!;
    const part = m.groups?.part;

    const apiType = type === 'work' ? 'concert' : type;
    const vidInfo = await this._download_json<Record<string, unknown>>(
      `https://api.digitalconcerthall.com/v2/${apiType}/${videoId}`,
      videoId,
      undefined,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': language,
          'User-Agent': DigitalConcertHallIE._USER_AGENT,
        },
      },
    );

    let videos: Record<string, unknown>[] = [];
    if (type === 'film') {
      videos = [vidInfo];
    } else {
      const embedded = vidInfo._embedded;
      if (embedded && typeof embedded === 'object') {
        videos = Object.values(embedded as Record<string, unknown>).flatMap((v) =>
          Array.isArray(v) ? (v as Record<string, unknown>[]) : [v as Record<string, unknown>],
        );
      }
    }
    if (type === 'work' && part) {
      videos = [videos[Number(part) - 1]!].filter(Boolean);
    }

    const links = (vidInfo._links as Record<string, unknown>) || {};
    const artistLinks = Array.isArray(links.artist) ? links.artist : [];
    const albumArtists = artistLinks
      .map((a) => (a && typeof a === 'object' ? String((a as Record<string, unknown>).name ?? '') : ''))
      .filter(Boolean);

    const imageList = Array.isArray(vidInfo.image) ? vidInfo.image : [];
    const thumbnail = imageList.map((img) => url_or_none(img)).find(Boolean) as string | undefined;

    const entries: VideoInfo[] = [];
    for await (const entry of this.entryItems(videos, language, type, { thumbnail, album_artists: albumArtists })) {
      entries.push(entry);
    }

    if (entries.length === 1) return entries[0]!;
    return {
      _type: 'playlist',
      id: videoId,
      title: (vidInfo.title as string) ?? undefined,
      entries,
      thumbnail,
      album_artists: albumArtists,
    };
  }
}
