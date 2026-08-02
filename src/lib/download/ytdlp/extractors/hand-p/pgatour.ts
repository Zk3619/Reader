/** PGATourIE — ported from yt-dlp pgatour.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class PGATourIE extends InfoExtractor {
  static IE_NAME = 'pgatour';
  static _VALID_URL = /https?:\/\/(?:www\.)?pgatour\.com\/video\/[\w-]+\/(?<tc>T)?(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id!;
    const isTourcast = Boolean(m.groups?.tc);
    const accountId = isTourcast ? '6116716431001' : '6082840763001';
    const playerId = isTourcast ? 'Vsd5Umu8r' : 'FWIBYMBPj';
    return this.url_result(
      `https://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${videoId}`,
      'BrightcoveNew',
      videoId,
    );
  }
}
