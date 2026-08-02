/** NonkTubeIE — ported from yt-dlp nonktube.py */

import type { VideoInfo } from '../../types';
import { parseHtml5MediaEntries } from './_helpers';
import { NuevoBaseIE } from './nuevo';

export class NonkTubeIE extends NuevoBaseIE {
  static IE_NAME = 'NonkTube';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nonktube\.com\/(?:(?:video|embed)\/|media\/nuevo\/embed\.php\?.*?\bid=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._og_search_title(webpage);
    const entries = await parseHtml5MediaEntries(this, url, webpage, videoId);
    const info = entries[0] || { formats: [] };
    return { ...info, id: videoId, title, age_limit: 18 };
  }
}
