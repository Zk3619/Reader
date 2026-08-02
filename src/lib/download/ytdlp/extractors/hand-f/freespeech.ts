/**
 * FreespeechIE ??ported from yt-dlp freespeech.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class FreespeechIE extends InfoExtractor {
  static IE_NAME = 'freespeech.org';
  static _VALID_URL = /https?:\/\/(?:www\.)?freespeech\.org\/stories\/(?<id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    return this.url_result(this._search_regex(/data-video-url="([^"]+)"/, webpage, 'youtube url')!, 'Youtube');
  }
}
