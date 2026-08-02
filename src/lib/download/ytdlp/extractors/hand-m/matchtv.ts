/** MatchTVIE — ported from yt-dlp matchtv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class MatchTVIE extends InfoExtractor {
  static IE_NAME = 'matchtv';
  static _VALID_URL = [
    /https?:\/\/matchtv\.ru\/on-air\/?(?:$|[?#])/,
    /https?:\/\/video\.matchtv\.ru\/iframe\/channel\/106\/?(?:$|[?#])/,
  ];

  async _real_extract(_url: string): Promise<VideoInfo> {
    const videoId = 'matchtv-live';
    const webpage = await this._download_webpage('https://video.matchtv.ru/iframe/channel/106', videoId);
    const videoUrl =
      this._html_search_regex(/data-config="config=(https?:\/\/[^?"]+)[?"]/, webpage, 'video URL')!.replace(
        '/feed/',
        '/media/',
      ) + '.m3u8';
    return {
      id: videoId,
      title: 'Матч ТВ - Прямой эфир',
      is_live: true,
      live_status: 'is_live',
      formats: await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, true),
    };
  }
}
