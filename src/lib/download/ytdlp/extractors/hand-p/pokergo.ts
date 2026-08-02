/** PokerGoBaseIE / PokerGoIE / PokerGoCollectionIE — ported from yt-dlp pokergo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';

let authToken: string | null = null;

export class PokerGoBaseIE extends InfoExtractor {
  static IE_NAME = 'pokergobase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _NETRC_MACHINE = 'pokergo';
  protected static _PROPERTY_ID = '1dfb3940-7d53-4980-b0b0-f28b369a000d';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PokerGoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    if (authToken) return;
    const basic = btoa(`${username}:${password}`);
    authToken =
      (
        await this._download_json<{ meta?: { token?: string } }>(
          `https://subscription.pokergo.com/properties/${PokerGoBaseIE._PROPERTY_ID}/sign-in`,
          undefined,
          'Logging in',
          {
            method: 'POST',
            headers: { authorization: `Basic ${basic}` },
            data: '',
          },
        )
      ).meta?.token || null;
    if (!authToken) throw new ExtractorError('Unable to get Auth Token.', { expected: true });
  }

  async _real_initialize(): Promise<void> {
    if (!authToken) this.raise_login_required(undefined, undefined, 'password');
  }
}

export class PokerGoIE extends PokerGoBaseIE {
  static IE_NAME = 'pokergo';
  static _VALID_URL = /https?:\/\/(?:www\.)?pokergo\.com\/videos\/(?<id>[^&$#/?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const dataJson = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        `https://api.pokergo.com/v2/properties/${PokerGoBaseIE._PROPERTY_ID}/videos/${videoId}`,
        videoId,
        undefined,
        { headers: { authorization: `Bearer ${authToken}` } },
      )
    ).data || {};
    const vId = String(dataJson.source ?? '');

    const thumbnails = ((dataJson.images as Array<Record<string, unknown>>) || [])
      .filter((img) => img.url)
      .map((img) => ({
        url: String(img.url),
        id: img.label as string | undefined,
        width: img.width as number | undefined,
        height: img.height as number | undefined,
      }));

    const showTags = (dataJson.show_tags as Array<Record<string, unknown>>) || [];
    const seriesJson = showTags.find((t) => t.video_id === videoId) || {};

    return {
      _type: 'url_transparent',
      id: vId,
      display_id: videoId,
      title: dataJson.title as string | undefined,
      description: dataJson.description as string | undefined,
      duration: dataJson.duration as number | undefined,
      thumbnails,
      season_number: seriesJson.season as number | undefined,
      episode_number: seriesJson.episode_number as number | undefined,
      series: traverse_obj(seriesJson, ['tag', 'name']) as string | undefined,
      url: `https://cdn.jwplayer.com/v2/media/${vId}`,
      ie_key: 'JWPlatform',
    };
  }
}

export class PokerGoCollectionIE extends PokerGoBaseIE {
  static IE_NAME = 'pokergo:collection';
  static _VALID_URL = /https?:\/\/(?:www\.)?pokergo\.com\/collections\/(?<id>[^&$#/?]+)/;

  protected async *_entries(playlistId: string): AsyncGenerator<VideoInfo> {
    const dataJson = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        `https://api.pokergo.com/v2/properties/${PokerGoBaseIE._PROPERTY_ID}/collections/${playlistId}?include=entities`,
        playlistId,
        undefined,
        { headers: { authorization: `Bearer ${authToken}` } },
      )
    ).data || {};
    for (const video of (dataJson.collection_video as Array<Record<string, unknown>>) || []) {
      const vid = video.id as string | undefined;
      if (vid) {
        yield this.url_result(`https://www.pokergo.com/videos/${vid}`, 'PokerGo', vid);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(playlistId)) entries.push(e);
    return this.playlist_result(entries, playlistId);
  }
}
