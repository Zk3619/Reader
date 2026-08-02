/**
 * CaracolTvPlayIE — ported from yt-dlp caracoltv.py
 * Uses the site's built-in guest login (no user credentials required).
 */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, js_to_json, traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class CaracolTvPlayIE extends InfoExtractor {
  static IE_NAME = 'caracoltvplay';
  static _VALID_URL = /https?:\/\/play\.caracoltv\.com\/videoDetails\/(?<id>[^/?#]+)/;
  static _NETRC_MACHINE = 'caracoltv-play';

  private static _userToken: string | null = null;

  private async _extractAppToken(webpage: string): Promise<string> {
    const configJsPath = this._search_regex(
      /<script[^>]+src\s*=\s*"([^"]+coreConfig.js[^"]+)/,
      webpage,
      'config js url',
      null,
      false,
    );

    let mediationConfig: Record<string, unknown> = {};
    if (configJsPath) {
      const configJs = await this._download_webpage(urljoin('https://play.caracoltv.com/', configJsPath), undefined, 'Extracting JS config', {
        fatal: false,
      });
      mediationConfig =
        this._search_json<Record<string, unknown>>(/mediation\s*:/, configJs, 'mediation_config', undefined, {
          transform_source: js_to_json,
          fatal: false,
        }) || {};
    }

    const key =
      (traverse_obj(mediationConfig, ['live', 'key']) as string) ||
      '795cd9c089a1fc48094524a5eba85a3fca1331817c802f601735907c8bbb4f50';
    const secret =
      (traverse_obj(mediationConfig, ['live', 'secret']) as string) ||
      '64dec00a6989ba83d087621465b5e5d38bdac22033b0613b659c442c78976fa0';

    return btoa(`${key}:${secret}`);
  }

  private async _performLogin(email: string, password: string): Promise<void> {
    const webpage = await this._download_webpage('https://play.caracoltv.com/', undefined, undefined, { fatal: false });
    const appToken = await this._extractAppToken(webpage);

    const bearerResp = await this._download_json<{ token: string }>(
      'https://eu-gateway.inmobly.com/applications/oauth',
      undefined,
      'Retrieving bearer token',
      { method: 'POST', data: '', headers: { Authorization: `Basic ${appToken}` } },
    );

    const loginResp = await this._download_json<{ user_token: string }>(
      'https://eu-gateway.inmobly.com/user/login',
      undefined,
      'Performing login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerResp.token}` },
        data: JSON.stringify({
          device_data: { device_id: uuidv4(), device_token: '', device_type: 'web' },
          login_data: { enabled: true, email, password },
        }),
      },
    );
    CaracolTvPlayIE._userToken = loginResp.user_token;
  }

  private async _extractVideo(
    videoData: Record<string, unknown>,
    seriesId?: string,
    seasonId?: string,
    seasonNumber?: unknown,
  ): Promise<VideoInfo> {
    const formats = await this._extract_m3u8_formats(videoData.stream_url as string, seriesId, 'mp4');

    const thumbnails: Thumbnail[] = ((videoData.extra_thumbs as Array<Record<string, unknown>>) || []).map((t) => ({
      url: t.thumb_url as string,
      height: int_or_none(t.height) ?? undefined,
      width: int_or_none(t.width) ?? undefined,
    }));

    return {
      id: String(videoData.id),
      title: (videoData.name as string) || undefined,
      description: (videoData.description as string) || undefined,
      formats,
      thumbnails,
      series_id: seriesId,
      season_id: seasonId,
      season_number: int_or_none(seasonNumber),
      episode_number: int_or_none(videoData.item_order),
      is_live: videoData.entry_type === 3,
    } as VideoInfo;
  }

  private async *_extractSeriesSeasons(
    seasons: Array<Record<string, unknown>>,
    seriesId: string,
  ): AsyncGenerator<VideoInfo> {
    for (const season of seasons) {
      const apiResponse = await this._download_json<{ items: Array<Record<string, unknown>> }>(
        'https://eu-gateway.inmobly.com/feed',
        seriesId,
        undefined,
        { query: { season_id: String(season.id) }, headers: { Authorization: `Bearer ${CaracolTvPlayIE._userToken}` } },
      );
      const seasonNumber = season.order;
      for (const episode of apiResponse.items) {
        yield this._extractVideo(episode, seriesId, String(season.id), seasonNumber);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);

    if (!CaracolTvPlayIE._userToken) {
      await this._performLogin('guest@inmobly.com', 'Test@gus1');
    }

    const feedResp = await this._download_json<{ items: Array<Record<string, unknown>> }>(
      'https://eu-gateway.inmobly.com/feed',
      seriesId,
      undefined,
      { query: { include_ids: seriesId }, headers: { Authorization: `Bearer ${CaracolTvPlayIE._userToken}` } },
    );
    const apiResponse = feedResp.items[0]!;

    if (!apiResponse.seasons) {
      return this._extractVideo(apiResponse);
    }

    const entries: VideoInfo[] = [];
    for await (const v of this._extractSeriesSeasons(apiResponse.seasons as Array<Record<string, unknown>>, seriesId)) {
      entries.push(v);
    }

    return this.playlist_result(entries, seriesId, apiResponse.name as string, apiResponse.description as string);
  }
}
