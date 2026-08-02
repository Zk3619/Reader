/**
 * EpochIE — ported from yt-dlp epoch.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes, get_element_by_id } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle } from './_helpers';

export class EpochIE extends InfoExtractor {
  static IE_NAME = 'epoch';
  static _VALID_URL = /https?:\/\/www\.theepochtimes\.com\/[\w-]+_(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const videobox = get_element_by_id('videobox', webpage);
    const youmakerVideoId = videobox ? extract_attributes(videobox)['data-id'] : null;
    if (!youmakerVideoId) {
      throw new Error('Unable to extract youmaker video id');
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `http://vs1.youmaker.com/assets/${youmakerVideoId}/playlist.m3u8`,
      pageId,
      'hls',
    );

    return {
      id: youmakerVideoId,
      formats,
      subtitles,
      title: htmlExtractTitle(webpage) || undefined,
    };
  }
}
