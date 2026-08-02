/**
 * Bilibili Audio (bilibili.com/audio) — aligned with bilibili.py
 * BilibiliAudioBaseIE / BilibiliAudioIE / BilibiliAudioAlbumIE.
 */

import { ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { BILI_HEADERS } from './bilibili-shared';
import { BilibiliBaseIE } from './bilibili-base';

export class BilibiliAudioBaseIE extends BilibiliBaseIE {
  static IE_NAME = 'bilibiliaudiobase';

  protected async callApi(
    path: string,
    sid: string,
    query?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://www.bilibili.com/audio/music-service-c/web/${path}`,
      sid,
      undefined,
      { query: query || { sid }, headers: BILI_HEADERS, fatal: false },
    );
    return (resp.data as Record<string, unknown>) || {};
  }
}

export class BilibiliAudioIE extends BilibiliAudioBaseIE {
  static IE_NAME = 'BilibiliAudio';
  static _VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/audio\/au(?<id>\d+)/i;
  static _TESTS = [{ url: 'https://www.bilibili.com/audio/au1003142', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const auId = this._match_id(url);

    const playData = await this.callApi('url', auId);
    const cdns = (playData.cdns as string[]) || [];
    if (!cdns.length) {
      throw new ExtractorError('No audio URL found for this track', { expected: true });
    }
    const formats: Format[] = [
      {
        format_id: '0',
        url: cdns[0]!,
        ext: 'm4a',
        filesize: Number(playData.size) || null,
        vcodec: 'none',
        http_headers: { Referer: url },
      },
    ];

    const song = await this.callApi('song/info', auId);
    const statistic = (song.statistic || {}) as Record<string, unknown>;

    let subtitles: VideoInfo['subtitles'];
    if (song.lyric) {
      subtitles = { origin: [{ ext: 'lrc', url: String(song.lyric) }] };
    }

    return {
      id: auId,
      title: String(song.title || auId),
      formats,
      artist: song.author != null ? String(song.author) : null,
      comment_count: Number(statistic.comment) || null,
      description: song.intro != null ? String(song.intro) : null,
      duration: Number(song.duration) || null,
      subtitles,
      thumbnail: song.cover != null ? String(song.cover) : null,
      timestamp: Number(song.passtime) || null,
      uploader: song.uname != null ? String(song.uname) : null,
      view_count: Number(statistic.play) || null,
      extractor: 'BilibiliAudio',
      extractor_key: 'BilibiliAudio',
      http_headers: { Referer: url },
    };
  }
}

export class BilibiliAudioAlbumIE extends BilibiliAudioBaseIE {
  static IE_NAME = 'BilibiliAudioAlbum';
  static _VALID_URL = /https?:\/\/(?:www\.)?bilibili\.com\/audio\/am(?<id>\d+)/i;
  static _TESTS = [{ url: 'https://www.bilibili.com/audio/am10624', only_matching: true }];

  async _real_extract(url: string): Promise<VideoInfo> {
    const amId = this._match_id(url);

    const songsData = await this.callApi('song/of-menu', amId, {
      sid: amId,
      pn: '1',
      ps: '100',
    });
    const songs = (songsData.data as Array<Record<string, unknown>>) || [];

    const entries: VideoInfo[] = [];
    for (const song of songs) {
      const sid = song.id != null ? String(song.id) : '';
      if (!sid) continue;
      entries.push(
        this.url_result(`https://www.bilibili.com/audio/au${sid}`, 'BilibiliAudio', sid),
      );
    }

    if (entries.length) {
      const albumData = await this.callApi('menu/info', amId);
      const albumTitle = albumData.title != null ? String(albumData.title) : '';
      if (albumTitle) {
        for (const entry of entries) (entry as VideoInfo & { album?: string }).album = albumTitle;
        return this.playlist_result(
          entries,
          amId,
          albumTitle,
          albumData.intro != null ? String(albumData.intro) : null,
        );
      }
    }

    return this.playlist_result(entries, amId);
  }
}
