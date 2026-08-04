// @ts-nocheck
/**
 * VTMIE â€?ported from yt-dlp vtm.py
 */

import { ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';
import { MedialaanBaseIE } from '../hand-m/medialaan';

export class VTMIE extends MedialaanBaseIE {
  static IE_NAME = 'vtm';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vtm\.be\/[^/?#]+~v(?<id>[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})/;

  async _real_initialize(): Promise<void> {
    if (!this._get_cookies('https://vtm.be/').authId) {
      this.raise_login_required();
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const apolloState =
      this._search_json<Record<string, unknown>>(
        /window\.__APOLLO_STATE__\s*=/,
        webpage,
        'apollo state',
        videoId,
      ) || {};
    const mychannelsId = str_or_none(
      traverse_obj(apolloState, [`Video:{"uuid":"${videoId}"}`, 'myChannelsVideo']),
    );
    if (!mychannelsId) {
      throw new ExtractorError('Unable to extract mychannels ID', { expected: true });
    }
    return this._extractFromMychannelsApi(mychannelsId);
  }
}
