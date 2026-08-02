/**
 * AliExpressLiveIE — aligned with yt-dlp aliexpress.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, try_get } from '../../utils';

export class AliExpressLiveIE extends InfoExtractor {
  static IE_NAME = 'aliexpresslive';
  static _VALID_URL = /https?:\/\/live\.aliexpress\.com\/live\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const runParamsRaw = this._search_regex(
      /runParams\s*=\s*(\{[\s\S]+?\})\s*;?\s*var/,
      webpage,
      'runParams',
    );
    const data = this._parse_json<Record<string, unknown>>(runParamsRaw, videoId)!;

    const formats = await this._extract_m3u8_formats(
      String(data.replyStreamUrl || ''),
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    return {
      id: videoId,
      title: String(data.title || videoId),
      thumbnail: data.coverUrl as string | undefined,
      uploader: try_get(data, (x) => (x.followBar as Record<string, unknown>)?.name as string) || undefined,
      timestamp: float_or_none(data.startTimeLong, 1000) ?? undefined,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'aliexpresslive',
      extractor_key: 'AliExpressLive',
    };
  }
}
