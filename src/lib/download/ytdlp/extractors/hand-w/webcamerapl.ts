// @ts-nocheck
/** WebcameraplIE â€?ported from yt-dlp webcamerapl.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles, rot13 } from './_helpers';

export class WebcameraplIE extends InfoExtractor {
  static IE_NAME = 'Webcamerapl';
  static _VALID_URL = /https?:\/\/(?<id>[\w-]+)\.webcamera\.pl/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const rot13M3u8Url = this._search_regex(
      /data-src\s*=\s*"(uggc[^"]+\.z3h8)"/,
      webpage,
      'm3u8 url',
      null,
      false,
    );
    if (!rot13M3u8Url) {
      this.raise_no_formats('No video/audio found at the provided url', true);
    }

    const m3u8Url = rot13(rot13M3u8Url!);
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId);

    return {
      id: videoId,
      title:
        this._html_search_regex(/<h1\b[^>]*>([^>]+)<\/h1>/, webpage, 'title') || videoId,
      formats,
      subtitles,
      is_live: true,
    };
  }
}
