/**
 * FathomIE â€?ported from yt-dlp fathom.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, float_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class FathomIE extends InfoExtractor {
  static IE_NAME = 'fathom';
  static _VALID_URL = /https?:\/\/(?:www\.)?fathom\.video\/share\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const appMatch = webpage.match(/<div[^>]+id=["']app["'][^>]*>/i);
    const attrs = appMatch ? extract_attributes(appMatch[0]) : {};
    const pageRaw = attrs['data-page'];
    const props = pageRaw
      ? ((JSON.parse(pageRaw) as Record<string, unknown>).props as Record<string, unknown>)
      : {};
    const call = (props.call as Record<string, unknown>) || {};
    const videoId = String(call.id ?? displayId);
    const videoUrl = String(call.video_url ?? '');

    const formats: Format[] = videoUrl
      ? await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native')
      : [];

    const head = (props.head as Record<string, unknown>) || {};
    return {
      id: videoId,
      title: typeof head.title === 'string' ? head.title : displayId,
      duration: float_or_none(props.duration) ?? undefined,
      timestamp: parseIso8601(call.started_at) ?? undefined,
      formats,
    };
  }
}
