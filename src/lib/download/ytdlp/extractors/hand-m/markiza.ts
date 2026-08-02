/** MarkizaIE / MarkizaPageIE — ported from yt-dlp markiza.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, try_get } from '../../utils';
import { orderedSet, parseJwplayerData } from './_helpers';

export class MarkizaIE extends InfoExtractor {
  static IE_NAME = 'markiza';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?videoarchiv\.markiza\.sk\/(?:video\/(?:[^/]+\/)*|embed\/)(?<id>\d+)(?:[_/]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      'http://videoarchiv.markiza.sk/json/video_jwplayer7.json',
      videoId,
      undefined,
      { query: { id: videoId } },
    );
    const info = await parseJwplayerData(this, data, videoId, { m3u8Id: 'hls', mpdId: 'dash' });
    if (info._type === 'playlist') {
      info.id = videoId;
      info.title = try_get(data, (x) => (x as Record<string, unknown>).details as Record<string, unknown>, undefined)?.name as
        | string
        | undefined;
    } else {
      info.duration =
        parse_duration(try_get(data, (x) => (x as Record<string, unknown>).details as Record<string, unknown>, undefined)?.duration) ??
        undefined;
    }
    return info;
  }
}

export class MarkizaPageIE extends InfoExtractor {
  static IE_NAME = 'markiza:page';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:(?:[^/]+\.)?markiza|tvnoviny)\.sk\/(?:[^/]+\/)*(?<id>\d+)_/;

  static suitable(url: string): boolean {
    if (MarkizaIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId, undefined, { fatal: true });
    const ids = orderedSet(Array.from(webpage.matchAll(/(?:initPlayer_|data-entity=["']|id=["']player_)(\d+)/g)).map((m) => m[1]!));
    const entries = ids.map((videoId) => this.url_result(`http://videoarchiv.markiza.sk/video/${videoId}`, 'Markiza', videoId));
    return this.playlist_result(entries, playlistId);
  }
}
