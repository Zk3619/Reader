/** SztvHuIE — ported from yt-dlp sztvhu.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class SztvHuIE extends InfoExtractor {
  static IE_NAME = 'sztvhu';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?sztv\.hu|www\.tvszombathely\.hu)\/(?:[^/]+\/)?.+-(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoFile = this._search_regex(/file: "...:(.*?)",/, webpage, 'video file')!;
    const title = this._html_search_regex(
      /<meta name="title" content="([^"]*?) - [^-]*? - [^-]*?"/,
      webpage,
      'video title',
    )!;
    const description =
      this._html_search_regex(
        /<meta name="description" content="([^"]*)"\/>/,
        webpage,
        'video description',
        null,
        false,
      ) || undefined;
    const thumbnail = this._og_search_thumbnail(webpage) || undefined;
    const videoUrl = `http://media.sztv.hu/vod/${videoFile}`;
    return {
      id: videoId,
      url: videoUrl,
      title,
      description,
      thumbnail,
    };
  }
}
