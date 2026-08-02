/**
 * RtmpIE / ViewSourceIE — ported from yt-dlp commonprotocols.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class RtmpIE extends InfoExtractor {
  static IE_NAME = 'rtmp';
  static _VALID_URL = /rtmp[est]?:\/\/.+/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = url.split('/').filter(Boolean).pop() || 'rtmp';
    const scheme = url.match(/^([a-z]+):/i)?.[1] || 'rtmp';
    return {
      id: videoId,
      title: videoId,
      formats: [{ url, ext: 'flv', format_id: scheme }],
    };
  }
}

export class ViewSourceIE extends InfoExtractor {
  static IE_NAME = 'viewsource';
  static _VALID_URL = /view-source:(?<url>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.url_result(this._match_valid_url(url)!.groups!.url!);
  }
}
