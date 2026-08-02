/**
 * Eggs.mu family — ported from yt-dlp eggs.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

function randomDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class EggsBaseIE extends InfoExtractor {
  static IE_NAME = 'eggsbase';
  static _VALID_URL: RegExp | string | false | null = false;

  private static _apiHeaders: Record<string, string> = {
    Accept: '*/*',
    apVersion: '8.2.00',
    deviceName: 'Android',
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('EggsBaseIE is not a standalone extractor', { expected: true });
  }

  async _real_initialize(): Promise<void> {
    if (!EggsBaseIE._apiHeaders.deviceId) {
      EggsBaseIE._apiHeaders.deviceId = randomDeviceId();
    }
  }

  protected async _callApi(endpoint: string, videoId: string): Promise<Record<string, unknown>> {
    await this._real_initialize();
    return (await this._download_json(`https://app-front-api.eggs.mu/v1/${endpoint}`, videoId, undefined, {
      headers: EggsBaseIE._apiHeaders,
    })) as Record<string, unknown>;
  }

  protected _extractMusicInfo(data: Record<string, unknown>): VideoInfo {
    const ytUrl = url_or_none(traverse_obj(data, ['youtubeUrl']));
    if (ytUrl) return this.url_result(ytUrl, 'Youtube');

    const artistName = str_or_none(traverse_obj(data, ['artist', 'artistName']));
    const musicId = str_or_none(traverse_obj(data, ['musicId']));
    const webpageUrl =
      artistName && musicId ? `https://eggs.mu/artist/${artistName}/song/${musicId}` : undefined;

    return {
      id: musicId || 'unknown',
      vcodec: 'none',
      webpage_url: webpageUrl,
      extractor_key: 'Eggs',
      extractor: EggsIE.IE_NAME,
      title: str_or_none(traverse_obj(data, ['musicTitle'])) ?? undefined,
      url: url_or_none(traverse_obj(data, ['musicDataPath'])) ?? undefined,
      uploader: str_or_none(traverse_obj(data, ['artist', 'displayName'])) ?? undefined,
      uploader_id: str_or_none(traverse_obj(data, ['artist', 'artistId'])) ?? undefined,
      thumbnail: url_or_none(traverse_obj(data, ['imageDataPath'])) ?? undefined,
      view_count: int_or_none(traverse_obj(data, ['numberOfMusicPlays'])) ?? undefined,
      like_count: int_or_none(traverse_obj(data, ['numberOfLikes'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(data, ['numberOfComments'])) ?? undefined,
      composers: traverse_obj(data, ['composer']) ? [String(traverse_obj(data, ['composer']))] : undefined,
      tags: (traverse_obj(data, ['tags'], { get_all: true }) as string[] | undefined) || undefined,
      timestamp: parseIso8601(traverse_obj(data, ['releaseDate'])) ?? undefined,
      artist: str_or_none(traverse_obj(data, ['artist', 'displayName'])) ?? undefined,
    };
  }
}

export class EggsIE extends EggsBaseIE {
  static IE_NAME = 'eggs:single';
  static _VALID_URL = /https?:\/\/eggs\.mu\/artist\/[^/?#]+\/song\/(?<id>[\da-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const jsonData = await this._callApi(`musics/${songId}`, songId);
    return this._extractMusicInfo(jsonData);
  }
}

export class EggsArtistIE extends EggsBaseIE {
  static IE_NAME = 'eggs:artist';
  static _VALID_URL = /https?:\/\/eggs\.mu\/artist\/(?<id>\w+)\/?(?:[?#&]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const artistId = this._match_id(url);
    const artistData = await this._callApi(`artists/${artistId}`, artistId);
    const songData = await this._callApi(`artists/${artistId}/musics`, artistId);
    const songs = (traverse_obj(songData, ['data'], { get_all: true }) as Record<string, unknown>[]) || [];

    return this.playlist_result(
      songs.filter(Boolean).map((item) => this._extractMusicInfo(item)),
      artistId,
      str_or_none(traverse_obj(artistData, ['displayName'])) ?? undefined,
      str_or_none(traverse_obj(artistData, ['profile'])) ?? undefined,
    );
  }
}
