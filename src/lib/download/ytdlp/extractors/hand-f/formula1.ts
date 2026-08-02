/**
 * Formula1IE â€?ported from yt-dlp formula1.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const BRIGHTCOVE_URL_TEMPLATE =
  'http://players.brightcove.net/6057949432001/S1WMrhjlh_default/index.html?videoId=%s';

export class Formula1IE extends InfoExtractor {
  static IE_NAME = 'formula1';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?formula1\.com\/en\/latest\/video\.[^.]+\.(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const bcId = this._match_id(url);
    return this.url_result(BRIGHTCOVE_URL_TEMPLATE.replace('%s', bcId), 'BrightcoveNew', bcId);
  }
}
