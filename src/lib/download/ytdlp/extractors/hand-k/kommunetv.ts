/**
 * KommunetvIE — ported from yt-dlp kommunetv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

function stripUrlQueryFragment(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return rawUrl.split('?')[0]!.split('#')[0]!;
  }
}

export class KommunetvIE extends InfoExtractor {
  static IE_NAME = 'kommunetv';
  static _VALID_URL = /https?:\/\/\w+\.kommunetv\.no\/archive\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._download_json<Record<string, unknown>>(
      `https://oslo.kommunetv.no/api/streams?streamType=1&id=${videoId}`,
      videoId,
      undefined,
      { headers: { Accept: 'application/json' } },
    );

    const stream = (data.stream as Record<string, unknown>) || {};
    const playlist = (data.playlist as Array<Record<string, unknown>>) || [];
    const inner = ((playlist[0]?.playlist as Array<Record<string, unknown>>) || [])[0];
    const file = stripUrlQueryFragment(String(inner?.file ?? ''));

    const formats = await this._extract_m3u8_formats(
      file,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
      undefined,
      false,
    );

    return {
      id: videoId,
      formats,
      title: String(stream.title ?? videoId),
    };
  }
}
