/** PearVideoIE — ported from yt-dlp pearvideo.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj, unified_timestamp } from '../../utils';

function qualityRank(order: string[]): (id: string) => number {
  const map = Object.fromEntries(order.map((k, i) => [k, order.length - i]));
  return (id) => map[id] ?? 0;
}

export class PearVideoIE extends InfoExtractor {
  static IE_NAME = 'pearvideo';
  static _VALID_URL = /https?:\/\/(?:www\.)?pearvideo\.com\/video_(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const quality = qualityRank(['ldflv', 'ld', 'sdflv', 'sd', 'hdflv', 'hd', 'src']);

    let formats: Format[] = [];
    for (const m of webpage.matchAll(/(?<id>[a-zA-Z]+)Url\s*=\s*(["'])(?<url>(?:https?:)?\/\/.+?)\2/g)) {
      formats.push({
        url: m.groups!.url!,
        format_id: m.groups!.id!,
        quality: quality(m.groups!.id!),
      });
    }

    if (!formats.length) {
      const info = await this._download_json<{ systemTime?: string; videoInfo?: { videos?: Record<string, string> } }>(
        'https://www.pearvideo.com/videoStatus.jsp',
        videoId,
        undefined,
        { query: { contId: videoId }, headers: { Referer: url } },
      );
      const videos = traverse_obj(info, ['videoInfo', 'videos']) as Record<string, string> | undefined;
      formats = Object.entries(videos || {})
        .filter(([, v]) => v)
        .map(([k, v]) => ({
          format_id: k,
          url: k === 'srcUrl' && info.systemTime ? v.replace(info.systemTime, `cont-${videoId}`) : v,
        }));
    }

    const title =
      this._search_regex(/<h1[^>]+\bclass=(["'])video-tt\1[^>]*>(?<value>[^<]+)/, webpage, 'title', null, true, 'value') ||
      this._search_regex(/<[^>]+\bdata-title=(["'])(?<value>(?:(?!\1).)+)\1/, webpage, 'title', null, true, 'value');
    const description =
      this._search_regex(/<div[^>]+\bclass=(["'])summary\1[^>]*>(?<value>[^<]+)/, webpage, 'description', null, false, 'value') ||
      this._html_search_meta('Description', webpage, null, false);
    const timestamp = unified_timestamp(
      this._search_regex(/<div[^>]+\bclass=["']date["'][^>]*>([^<]+)/, webpage, 'timestamp', null, false),
    );

    return {
      id: videoId,
      title: title || videoId,
      description: description ?? undefined,
      timestamp: timestamp ?? undefined,
      formats,
    };
  }
}
