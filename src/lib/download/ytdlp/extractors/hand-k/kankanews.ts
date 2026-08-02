/**
 * KankaNewsIE — ported from yt-dlp kankanews.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { md5Hex } from './_helpers';

function randomNonce(len = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export class KankaNewsIE extends InfoExtractor {
  static IE_NAME = 'kankanews';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?kankanews\.com\/a\/\d+\-\d+\-\d+\/(?<id>\d+)\.shtml/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(/omsid\s*=\s*"(\d+)"/, webpage, 'video id')!;

    const params: Record<string, string> = {
      nonce: randomNonce(8),
      omsid: videoId,
      platform: 'pc',
      timestamp: String(Math.floor(Date.now() / 1000)),
      version: '1.0',
    };
    const qs = new URLSearchParams(Object.entries(params)).toString();
    params.sign = md5Hex(md5Hex(`${qs}&28c8edde3d61a0411511d3b1866f0636`));

    const meta = (
      await this._download_json<{ result?: { video?: Record<string, unknown> } }>(
        'https://api-app.kankanews.com/kankan/pc/getvideo',
        videoId,
        undefined,
        { query: params },
      )
    ).result?.video;

    return {
      id: videoId,
      url: String(meta?.videourl ?? ''),
      title: this._search_regex(/g\.title\s*=\s*"([^"]+)"/, webpage, 'title') ?? undefined,
      thumbnail: (meta?.titlepic as string | undefined) ?? undefined,
    };
  }
}
