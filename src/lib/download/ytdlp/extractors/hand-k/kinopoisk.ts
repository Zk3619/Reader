/**
 * KinoPoiskIE — ported from yt-dlp kinopoisk.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { dict_get, int_or_none } from '../../utils';

export class KinoPoiskIE extends InfoExtractor {
  static IE_NAME = 'kinopoisk';
  static _GEO_COUNTRIES = ['RU'];
  static _VALID_URL = /https?:\/\/(?:www\.)?kinopoisk\.ru\/film\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const webpage = await this._download_webpage(
      'https://ott-widget.kinopoisk.ru/v1/kp/',
      videoId,
      undefined,
      { query: { kpId: videoId } },
    );

    const data = this._parse_json<{ models?: Record<string, unknown> }>(
      this._search_regex(
        /<script[^>]+\btype=["']application\/json[^>]+>([\s\S]+?)</,
        webpage,
        'data',
      ),
      videoId,
    )!.models!;

    const film = (data.filmStatus as Record<string, unknown>) || {};
    const title = (film.title as string | undefined) || String(film.originalTitle ?? videoId);

    const formats = await this._extract_m3u8_formats(
      String((data.playlistEntity as Record<string, unknown>).uri ?? ''),
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const description = dict_get(film, [
      'descriptscription',
      'description',
      'shortDescriptscription',
      'shortDescription',
    ]) as string | undefined;

    return {
      id: videoId,
      title,
      description: description ?? undefined,
      thumbnail: (film.coverUrl as string | undefined) || (film.posterUrl as string | undefined) || undefined,
      duration: int_or_none(film.duration) ?? undefined,
      age_limit: int_or_none(film.restrictionAge) ?? undefined,
      formats,
    };
  }
}
