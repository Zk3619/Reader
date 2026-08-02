/**
 * EuropeanTourIE — ported from yt-dlp europeantour.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const BRIGHTCOVE_URL_TEMPLATE =
  'http://players.brightcove.net/%s/default_default/index.html?videoId=%s';

export class EuropeanTourIE extends InfoExtractor {
  static IE_NAME = 'europeantour';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?europeantour\.com\/dpworld-tour\/news\/video\/(?<id>[^/&?#$]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const webpage = await this._download_webpage(url, slug);
    const match = webpage.match(
      /brightcove-player\s?video-id="([^"]+)"[\s\S]*?"ACCOUNT_ID":"([^"]+)"/,
    );
    const vid = match?.[1];
    let aid = match?.[2];
    if (!vid) throw new Error('Unable to extract Brightcove video id');
    if (!aid) aid = '5136026580001';
    return this.url_result(BRIGHTCOVE_URL_TEMPLATE.replace('%s', aid).replace('%s', vid), 'BrightcoveNew');
  }
}
