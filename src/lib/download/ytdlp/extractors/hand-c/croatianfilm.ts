/**
 * CroatianFilmIE — ported from yt-dlp croatianfilm.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url, traverse_obj } from '../../utils';

export class CroatianFilmIE extends InfoExtractor {
  static IE_NAME = 'croatian.film';
  static _VALID_URL = /https:?\/\/(?:www\.)?croatian\.film\/[a-z]{2}\/[^/?#]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const apiData = await this._download_json<Record<string, unknown>>(
      `https://api.croatian.film/api/videos/${displayId}`,
      displayId,
    );

    const errors = (apiData.errors as Array<Record<string, unknown>>) || [];
    if (errors.length) {
      const codes = errors.map((e) => String(e.code));
      if (codes.includes('INVALID_COUNTRY')) this.raise_geo_restricted(undefined, ['HR']);
      throw new ExtractorError(
        (errors.map((e) => e.details).filter(Boolean).join('; ') || codes.join('; ')),
      );
    }

    const vimeoUrl = traverse_obj(apiData, ['video', 'vimeoURL']) as string;
    const vimeoId = this._search_regex(/\/videos\/(\d+)/, vimeoUrl, 'vimeo ID')!;

    return this.url_result(
      smuggle_url(`https://player.vimeo.com/video/${vimeoId}`, { referer: url }),
      'Vimeo',
      vimeoId,
    );
  }
}
