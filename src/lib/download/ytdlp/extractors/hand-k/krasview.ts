/**
 * KrasViewIE — ported from yt-dlp krasview.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, js_to_json } from '../../utils';

export class KrasViewIE extends InfoExtractor {
  static IE_NAME = 'krasview';
  static IE_DESC = 'Красвью';
  static _VALID_URL = /https?:\/\/krasview\.ru\/(?:video|embed)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const flashvars = JSON.parse(
      js_to_json(this._search_regex(/video_Init\(({.+?})/, webpage, 'flashvars')!),
    ) as Record<string, unknown>;

    return {
      id: videoId,
      url: String(flashvars.url ?? ''),
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail:
        (flashvars.image as string | undefined) ||
        this._og_search_thumbnail(webpage) ||
        undefined,
      duration: int_or_none(flashvars.duration) ?? undefined,
      width: int_or_none(this._og_search_property('video:width', webpage, 'video width', false)) ?? undefined,
      height: int_or_none(this._og_search_property('video:height', webpage, 'video height', false)) ?? undefined,
    };
  }
}
