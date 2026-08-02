/**
 * LocoIE — ported from yt-dlp loco.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { jwtDecodePayload, searchNextjsData } from './_helpers';

export class LocoIE extends InfoExtractor {
  static IE_NAME = 'loco';
  static _VALID_URL = /https?:\/\/(?:www\.)?loco\.com\/(?<type>streamers|stream)\/(?<id>[^/?#]+)/;

  static _CLIENT_ID = 'TlwKp1zmF6eKFpcisn3FyR18WkhcPkZtzwPVEEC3';
  static _CLIENT_SECRET =
    'Kp7tYlUN7LXvtcSpwYvIitgYcLparbtsQSe5AdyyCdiEJBP53Vt9J8eB4AsLdChIpcO2BM19RA3HsGtqDJFjWmwoonvMSG3ZQmnS8x1YIM8yl82xMXZGbE3NKiqmgBVU';

  protected _isJwtExpired(token: string): boolean {
    const exp = jwtDecodePayload(token).exp;
    return typeof exp !== 'number' || exp - Date.now() / 1000 < 300;
  }

  protected async _getAccessToken(videoId: string): Promise<string | null> {
    const cookies = this._get_cookies('https://loco.com');
    let accessToken: string | null = cookies.access_token || null;
    if (accessToken && !this._isJwtExpired(accessToken)) return accessToken;

    const deviceId = `${[...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')}live`;
    const resp = await this._download_json<Record<string, unknown>>(
      'https://api.getloconow.com/v3/user/device_profile/',
      videoId,
      'Downloading access token',
      {
        method: 'POST',
        fatal: false,
        data: JSON.stringify({
          platform: 7,
          client_id: LocoIE._CLIENT_ID,
          client_secret: LocoIE._CLIENT_SECRET,
          model: 'Mozilla',
          os_name: 'Win32',
          os_ver: '5.0 (Windows)',
          app_ver: '5.0 (Windows)',
        }),
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'DEVICE-ID': deviceId,
          'X-APP-LANG': 'en',
          'X-APP-LOCALE': 'en-US',
          'X-CLIENT-ID': LocoIE._CLIENT_ID,
          'X-CLIENT-SECRET': LocoIE._CLIENT_SECRET,
          'X-PLATFORM': '7',
        },
      },
    );

    accessToken = str_or_none(resp.access_token);
    if (accessToken && !this._isJwtExpired(accessToken)) return accessToken;
    return null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoType = m.groups?.type || 'stream';
    const videoId = m.groups?.id || this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const nextData = searchNextjsData(this, webpage, videoId);
    let stream: Record<string, unknown> | null = null;
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object' || stream) return;
      const obj = node as Record<string, unknown>;
      for (const key of ['liveStreamData', 'stream', 'liveStream']) {
        const val = obj[key];
        if (val && typeof val === 'object') {
          stream = val as Record<string, unknown>;
          return;
        }
      }
      if (obj.ssrData && typeof obj.ssrData === 'object') walk(obj.ssrData);
      for (const v of Object.values(obj)) {
        if (stream) break;
        walk(v);
      }
    };
    walk(nextData);
    if (!stream) throw new Error('Unable to extract stream info');
    const streamData: Record<string, unknown> = stream;

    const accessToken = await this._getAccessToken(videoId);
    if (accessToken) {
      await this._request_webpage('https://drm.loco.com/v1/streams/playback/', videoId, 'Downloading video authorization', {
        headers: { authorization: accessToken },
        fatal: false,
      });
    }

    const conf = (streamData.conf as Record<string, unknown>) || {};
    const hls = str_or_none(conf.hls) || '';

    return {
      formats: await this._extract_m3u8_formats(hls, videoId),
      id: videoId,
      is_live: videoType === 'streamers',
      title: str_or_none(streamData.title) ?? undefined,
      series: str_or_none(streamData.game_name) ?? undefined,
      uploader_id: str_or_none(streamData.user_uid) ?? undefined,
      channel: str_or_none(streamData.alias) ?? undefined,
      description: str_or_none(streamData.description) ?? undefined,
      concurrent_view_count: int_or_none(streamData.viewersCurrent) ?? undefined,
      view_count: int_or_none(streamData.total_views) ?? undefined,
      thumbnail: url_or_none(streamData.thumbnail_url_small) ?? undefined,
      like_count: int_or_none(streamData.likes) ?? undefined,
      tags: Array.isArray(streamData.tags) ? (streamData.tags as string[]) : undefined,
      timestamp: int_or_none(streamData.started_at, 1000) ?? undefined,
      modified_timestamp: int_or_none(streamData.updated_at, 1000) ?? undefined,
      comment_count: int_or_none(streamData.comments_count) ?? undefined,
      channel_follower_count: int_or_none(streamData.followers_count) ?? undefined,
      duration: int_or_none(streamData.duration) ?? undefined,
    };
  }
}
