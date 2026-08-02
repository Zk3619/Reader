/**
 * TruNewsIE — ported from yt-dlp trunews.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class TruNewsIE extends InfoExtractor {
  static IE_NAME = 'trunews';
  static _VALID_URL = /https?:\/\/(?:www\.)?trunews\.com\/stream\/(?<id>[^/?#&]+)/;
  static _ZYPE_TEMPL =
    'https://player.zype.com/embed/%s.js?api_key=X5XnahkjCwJrT_l5zUqypnaLEObotyvtUKJWWlONxDoHVjP8vqxlArLV8llxMbyt';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const data = await this._download_json<{ response?: Array<{ _id?: string }> }>(
      'https://api.zype.com/videos',
      displayId,
      undefined,
      {
        query: {
          app_key: 'PUVKp9WgGUb3-JUw6EqafLx8tFVP6VKZTWbUOR-HOm__g4fNDt1bCsm_LgYf_k9H',
          per_page: '1',
          active: 'true',
          friendly_title: displayId,
        },
      },
    );
    const zypeId = data.response?.[0]?._id;
    if (!zypeId) throw new Error('No Zype video found');
    return this.url_result(TruNewsIE._ZYPE_TEMPL.replace('%s', zypeId), 'Zype', zypeId);
  }
}
