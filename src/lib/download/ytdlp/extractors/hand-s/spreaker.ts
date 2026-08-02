/** SpreakerIE / SpreakerShowIE — ported from yt-dlp spreaker.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  parse_qs,
  str_or_none,
  try_get,
  unified_timestamp,
  url_or_none,
  traverse_obj,
} from '../../utils';

function extractEpisode(data: Record<string, unknown>, episodeId?: string): VideoInfo {
  const title = String(data.title || '');
  const downloadUrl = String(data.download_url || '');
  const series = try_get(data, (x) => (x.show as Record<string, unknown>)?.title) as string | undefined;
  const uploader = try_get(data, (x) => (x.author as Record<string, unknown>)?.fullname) as string | undefined;
  const thumbnails: Thumbnail[] = [];
  for (const image of ['image_original', 'image_medium', 'image']) {
    const imageUrl = url_or_none(data[`${image}_url`]);
    if (imageUrl) thumbnails.push({ url: imageUrl });
  }
  const stats = (key: string) =>
    int_or_none(
      try_get(data, (x) => x[`${key}s_count`]) ?? try_get(data, (x) => (x.stats as Record<string, unknown>)?.[`${key}s`]),
    );
  const duration = (key: string) => float_or_none(data[key], 1000);
  return {
    id: String(episodeId || data.episode_id),
    url: downloadUrl,
    display_id: str_or_none(data.permalink) || undefined,
    title,
    description: (data.description as string) || undefined,
    timestamp: unified_timestamp(data.published_at) ?? undefined,
    uploader,
    uploader_id: str_or_none(data.author_id) || undefined,
    creator: uploader,
    duration: duration('duration') ?? duration('length') ?? undefined,
    view_count: stats('play') ?? undefined,
    like_count: stats('like') ?? undefined,
    comment_count: stats('message') ?? undefined,
    format: 'MPEG Layer 3',
    format_id: 'mp3',
    container: 'mp3',
    ext: 'mp3',
    thumbnails,
    series,
    extractor_key: 'Spreaker',
  };
}

export class SpreakerIE extends InfoExtractor {
  static IE_NAME = 'spreaker';
  static _VALID_URL = [
    /https?:\/\/api\.spreaker\.com\/(?:download\/)?episode|v2\/episodes\/(?<id>\d+)/,
    /https?:\/\/(?:www\.)?spreaker\.com\/episode\/[^#?/]*?(?<id>\d+)\/?(?:[?#]|$)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const qs = parse_qs(url);
    const data = (
      await this._download_json<{ response?: { episode?: Record<string, unknown> } }>(
        `https://api.spreaker.com/v2/episodes/${episodeId}`,
        episodeId,
        undefined,
        { query: qs.key?.[0] ? { key: qs.key[0] } : undefined },
      )
    ).response?.episode!;
    return extractEpisode(data, episodeId);
  }
}

export class SpreakerShowIE extends InfoExtractor {
  static IE_NAME = 'spreaker:show';
  static _VALID_URL = [
    /https?:\/\/api\.spreaker\.com\/show\/(?<id>\d+)/,
    /https?:\/\/(?:www\.)?spreaker\.com\/podcast\/[\w-]+--(?<id>[\d]+)/,
    /https?:\/\/(?:www\.)?spreaker\.com\/show\/(?<id>\d+)\/episodes\/feed/,
  ];

  protected async *_entries(showId: string, key?: string): AsyncGenerator<VideoInfo> {
    for (let pageNum = 1; ; pageNum++) {
      const episodes = await this._download_json<{ response?: { pager?: Record<string, unknown> } }>(
        `https://api.spreaker.com/show/${showId}/episodes`,
        showId,
        `Downloading JSON page ${pageNum}`,
        {
          query: {
            ...(key ? { key } : {}),
            page: String(pageNum),
            max_per_page: '100',
          },
        },
      );
      const pager = try_get(episodes, (x) => x.response?.pager) as Record<string, unknown> | undefined;
      if (!pager) break;
      const results = pager.results;
      if (!Array.isArray(results) || !results.length) break;
      for (const result of results) {
        if (result && typeof result === 'object') yield extractEpisode(result as Record<string, unknown>);
      }
      if (pageNum === pager.last_page) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const key = traverse_obj(parse_qs(url), ['key', 0]) as string | undefined;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(showId, key)) entries.push(e);
    return this.playlist_result(entries, showId);
  }
}
