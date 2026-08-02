/**
 * ChilloutzoneIE — ported from yt-dlp chilloutzone.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none } from '../../utils';

function decodeBase64Json(b64: string): Record<string, unknown> {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as Record<string, unknown>;
}

export class ChilloutzoneIE extends InfoExtractor {
  static IE_NAME = 'chilloutzone';
  static _VALID_URL = /https?:\/\/(?:www\.)?chilloutzone\.net\/video\/(?<id>[\w-]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const b64Data = this._html_search_regex(/var cozVidData\s*=\s*"([^"]+)"/, webpage, 'video data')!;
    const info = decodeBase64Json(b64Data);

    const videoUrl = info.mediaUrl as string | undefined;
    const nativePlatform = info.nativePlatform as string | undefined;

    if (nativePlatform && info.sourcePriority === 'native') {
      const nativeVideoId = String(info.nativeVideoId);
      if (nativePlatform === 'youtube') {
        return this.url_result(nativeVideoId, 'Youtube');
      }
      if (nativePlatform === 'vimeo') {
        return this.url_result(`https://vimeo.com/${nativeVideoId}`, 'Vimeo');
      }
    } else if (!videoUrl) {
      return this.url_result(url, 'Generic');
    }

    const description = clean_html(info.description as string | undefined);

    return {
      id: videoId,
      url: videoUrl,
      ext: 'mp4',
      title: (info.title as string) || videoId,
      description: description ?? undefined,
      duration: int_or_none(info.videoLength) ?? undefined,
      width: int_or_none(info.videoWidth) ?? undefined,
      height: int_or_none(info.videoHeight) ?? undefined,
    };
  }
}
