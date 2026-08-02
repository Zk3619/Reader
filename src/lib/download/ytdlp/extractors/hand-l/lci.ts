/**
 * LCIIE — ported from yt-dlp lci.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { searchNextjsData } from './_helpers';

export class LCIIE extends InfoExtractor {
  static IE_NAME = 'lci';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:lci|tf1info)\.fr\/(?:[^/?#]+\/)+[\w-]+-(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextData = searchNextjsData(this, webpage, videoId);
    const videos = traverse_obj(nextData, ['pageProps', 'page', 'tms', 'videos']) as Record<string, unknown> | undefined;
    let watId: number | null = null;
    if (videos && typeof videos === 'object') {
      for (const k of Object.keys(videos)) {
        const n = int_or_none(k);
        if (n != null) {
          watId = n;
          break;
        }
      }
    }
    if (watId == null) {
      throw new ExtractorError('Could not find wat_id');
    }

    return this.url_result(`wat:${watId}`, 'Wat', String(watId));
  }
}
