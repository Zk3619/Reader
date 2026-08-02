/** PrankCastIE / PrankCastPostIE — ported from yt-dlp prankcast.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, str_or_none, url_or_none } from '../../utils';
import { parse_iso8601, searchNextjsData } from './_helpers';

export class PrankCastIE extends InfoExtractor {
  static IE_NAME = 'prankcast';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?prankcast\.com\/[^/?#]+\/showreel\/(?<id>\d+)-(?<display_id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';
    const webpage = await this._download_webpage(url, videoId);
    const jsonInfo = (
      (searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>)?.ssr_data_showreel as Record<
        string,
        unknown
      >
    ) || {};

    const uploader = jsonInfo.user_name as string | undefined;
    const guestsJson = this._parse_json(String(jsonInfo.guests_json ?? '{}'), videoId) as Array<{ name?: string }>;
    const startDate = parse_iso8601(jsonInfo.start_date as string);
    const endDate = parse_iso8601(jsonInfo.end_date as string);

    return {
      id: videoId,
      title: (jsonInfo.broadcast_title as string) || this._og_search_title(webpage) || undefined,
      display_id: displayId,
      url: `${jsonInfo.broadcast_url}${jsonInfo.recording_hash}.mp3`,
      timestamp: startDate ?? undefined,
      uploader,
      channel_id: str_or_none(jsonInfo.user_id) ?? undefined,
      duration: startDate && endDate ? endDate - startDate : undefined,
      cast: [uploader, ...guestsJson.map((g) => g.name)].filter(Boolean) as string[],
      description: (jsonInfo.broadcast_description as string) ?? undefined,
      categories: jsonInfo.broadcast_category ? [String(jsonInfo.broadcast_category)] : undefined,
      tags: jsonInfo.broadcast_tags ? String(jsonInfo.broadcast_tags).split(',') : undefined,
      vcodec: 'none',
      ext: 'mp3',
    };
  }
}

export class PrankCastPostIE extends InfoExtractor {
  static IE_NAME = 'prankcast:post';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?prankcast\.com\/[^/?#]+\/posts\/(?<id>\d+)-(?<display_id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';
    const webpage = await this._download_webpage(url, videoId);
    const post =
      ((searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>)?.ssr_data_posts as Record<
        string,
        unknown
      >) || {};
    const content = (this._parse_json(String(post.post_contents_json ?? '[]'), videoId) as Record<string, unknown>[])[0] || {};

    const guests = this._parse_json(String(content.guests_json ?? '[]'), videoId) as Array<{ name?: string }>;
    const ts =
      parse_iso8601(String(content.start_date ?? '').replace(' ', 'T')) ||
      parse_iso8601(String(content.crdate ?? '').replace(' ', 'T')) ||
      parse_iso8601(content.created_at);

    return {
      id: videoId,
      display_id: displayId,
      title: (post.post_title as string) || this._og_search_title(webpage) || undefined,
      description: (post.post_body as string) ?? undefined,
      tags: post.post_tags ? String(post.post_tags).split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      channel_id: post.user_id != null ? String(post.user_id) : undefined,
      uploader: post.user_name as string | undefined,
      url: url_or_none(content.secure_url) || url_or_none(content.url) || undefined,
      timestamp: ts ?? undefined,
      duration: float_or_none(content.duration) ?? undefined,
      categories: content.category ? [String(content.category)] : undefined,
      cast: [post.user_name, ...guests.map((g) => g.name)].filter(Boolean) as string[],
      vcodec: 'none',
      ext: 'mp3',
    };
  }
}
