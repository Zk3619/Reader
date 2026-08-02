/**
 * MonsterSirenHypergryphMusicIE — ported from yt-dlp hypergryph.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { clean_html, traverse_obj, url_or_none } from '../../utils';

export class MonsterSirenHypergryphMusicIE extends InfoExtractor {
  static IE_NAME = 'monstersiren';
  static IE_DESC = 'Monster Siren Records';
  static _API_BASE = 'https://monster-siren.hypergryph.com/api';
  static _VALID_URL = /https?:\/\/monster-siren\.hypergryph\.com\/music\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const song = await this._download_json<Record<string, unknown>>(`${MonsterSirenHypergryphMusicIE._API_BASE}/song/${audioId}`, audioId);
    if (traverse_obj(song, ['code']) !== 0) {
      const msg = traverse_obj(song, ['msg']) as string | undefined;
      throw new ExtractorError(msg || 'API returned an error response', { expected: !!msg });
    }

    const data = (song.data as Record<string, unknown>) || {};
    let albumData: Record<string, unknown> | undefined;
    const albumId = traverse_obj(data, ['albumCid']) as string | undefined;
    if (albumId) {
      const album = await this._download_json<Record<string, unknown>>(
        `${MonsterSirenHypergryphMusicIE._API_BASE}/album/${albumId}/detail`,
        albumId,
        undefined,
        { fatal: false },
      );
      albumData = (album.data as Record<string, unknown>) || undefined;
    }

    const artists = Array.isArray(data.artists) ? data.artists.map(String) : undefined;
    let subtitles: Record<string, Subtitle[]> | undefined;
    const lyricUrl = url_or_none(data.lyricUrl);
    if (lyricUrl) subtitles = { en: [{ url: lyricUrl, ext: 'lrc' }] };

    return {
      id: audioId,
      vcodec: 'none',
      title: data.name != null ? String(data.name) : audioId,
      artists,
      subtitles,
      url: url_or_none(data.sourceUrl) ?? undefined,
      album: albumData?.name != null ? String(albumData.name) : undefined,
      description: albumData?.intro != null ? clean_html(String(albumData.intro)) ?? undefined : undefined,
      thumbnail: url_or_none(albumData?.coverUrl) ?? undefined,
    };
  }
}
