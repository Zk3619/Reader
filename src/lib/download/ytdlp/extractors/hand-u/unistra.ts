// @ts-nocheck
/** UnistraIE â€?ported from yt-dlp unistra.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { qualities } from './_helpers';

export class UnistraIE extends InfoExtractor {
  static IE_NAME = 'unistra';
  static _VALID_URL = /https?:\/\/utv\.unistra\.fr\/(?:index|video)\.php\?id_video=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const files = new Set([...webpage.matchAll(/file\s*:\s*"(\/[^"]+)"/g)].map((m) => m[1]!));

    const quality = qualities(['SD', 'HD']);
    const formats: Format[] = [];
    for (const filePath of files) {
      const formatId = filePath.endsWith('-HD.mp4') ? 'HD' : 'SD';
      formats.push({
        url: `http://vod-flash.u-strasbg.fr:8080${filePath}`,
        format_id: formatId,
        quality: quality(formatId),
      });
    }

    const title = this._html_search_regex(/<title>UTV - (.*?)<\//, webpage, 'title');
    const description = this._html_search_regex(
      /<meta name="Description" content="(.*?)"/s,
      webpage,
      'description',
    );
    const thumbnail = this._search_regex(/image: "(.*?)"/, webpage, 'thumbnail');

    return {
      id: videoId,
      title: title || videoId,
      description: description || undefined,
      thumbnail: thumbnail || undefined,
      formats,
    };
  }
}
