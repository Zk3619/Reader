// @ts-nocheck
/** YfanefaIE â€?ported from yt-dlp yfanefa.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, remove_end, url_or_none } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class YfanefaIE extends InfoExtractor {
  static IE_NAME = 'yfanefa';
  static _VALID_URL = /https?:\/\/(?:www\.)?yfanefa\.com\/(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const webpage = await this._download_webpage(url, videoId);
    const playerData = this._search_json(
      /iwPlayer\.options\["[\w.]+"\]\s*=/,
      webpage,
      'player options',
      videoId,
    ) as Record<string, unknown>;

    const videoUrl = `${String(playerData.url || '')}${playerData.signature != null ? String(playerData.signature) : ''}`;
    let formats: Format[];
    if (determine_ext(videoUrl) === 'm3u8') {
      formats = await this._extract_m3u8_formats(
        videoUrl,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
    } else {
      formats = [{ url: videoUrl, ext: 'mp4' }];
    }

    return {
      id: videoId.replace(/\/+$/, '').replace(/\//g, '-'),
      title:
        this._og_search_title(webpage, false) ||
        remove_end(htmlExtractTitle(webpage), ' | Yorkshire Film Archive') ||
        videoId,
      formats,
      thumbnail: url_or_none(playerData.preview) || undefined,
      duration: int_or_none(playerData.duration) ?? undefined,
    };
  }
}
