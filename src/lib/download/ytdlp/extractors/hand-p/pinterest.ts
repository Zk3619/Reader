/** PinterestBaseIE / PinterestIE / PinterestCollectionIE — ported from yt-dlp pinterest.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, strip_or_none } from './_helpers';

const VALID_URL_BASE =
  /https?:\/\/(?:[^/]+\.)?pinterest\.(?:com|fr|de|ch|jp|cl|ca|it|co\.uk|nz|ru|com\.au|at|pt|co\.kr|es|com\.mx|dk|ph|th|com\.uy|co|nl|info|kr|ie|vn|com\.vn|ec|mx|in|pe|co\.at|hu|co\.in|co\.nz|id|com\.ec|com\.py|tw|be|uk|com\.bo|com\.pe)/;

export class PinterestBaseIE extends InfoExtractor {
  static IE_NAME = 'pinterestbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('PinterestBaseIE is not a standalone extractor');
  }

  protected async _callApi(resource: string, videoId: string, options: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resp = await this._download_json<{ resource_response: Record<string, unknown> }>(
      `https://www.pinterest.com/resource/${resource}Resource/get/`,
      videoId,
      `Download ${resource} JSON metadata`,
      { query: { data: JSON.stringify({ options }) }, headers: { 'X-Pinterest-PWS-Handler': 'www/[username].js' } },
    );
    return resp.resource_response || {};
  }

  protected async _extractVideo(data: Record<string, unknown>, extractFormats = true): Promise<VideoInfo> {
    const videoId = String(data.id ?? '');
    const thumbnails: Thumbnail[] = [];
    const images = data.images as Record<string, Record<string, unknown>> | undefined;
    if (images && typeof images === 'object') {
      for (const thumbnail of Object.values(images)) {
        const thumbnailUrl = url_or_none(thumbnail?.url);
        if (!thumbnailUrl) continue;
        thumbnails.push({
          url: thumbnailUrl,
          width: int_or_none(thumbnail.width) ?? undefined,
          height: int_or_none(thumbnail.height) ?? undefined,
        });
      }
    }

    const info: Partial<VideoInfo> = {
      title: strip_or_none(String(data.title ?? data.grid_title ?? '')) || undefined,
      description: str_or_none(data.seo_description) || str_or_none(data.description) || undefined,
      timestamp: unified_timestamp(data.created_at) ?? undefined,
      thumbnails,
      uploader: str_or_none(traverse_obj(data, ['closeup_attribution', 'full_name'])) ?? undefined,
      uploader_id: str_or_none(traverse_obj(data, ['closeup_attribution', 'id'])) ?? undefined,
      repost_count: int_or_none(data.repin_count) ?? undefined,
      comment_count: int_or_none(data.comment_count) ?? undefined,
      categories: (traverse_obj(data, ['pin_join', 'visual_annotation']) as string[]) || undefined,
      tags: (data.hashtags as string[]) || undefined,
    };

    const domain = str_or_none(data.domain)?.toLowerCase();
    const embedSrc = traverse_obj(data, ['embed', 'src']) as string | undefined;
    if (domain !== 'uploaded by user' && embedSrc) {
      return { _type: 'url_transparent', url: embedSrc, ...info, id: videoId };
    }

    const formats: Format[] = [];
    let duration: number | undefined;
    if (extractFormats) {
      const videoList =
        (traverse_obj(data, ['videos', 'video_list']) as Record<string, Record<string, unknown>>) ||
        (traverse_obj(data, ['story_pin_data', 'pages', 0, 'blocks', 0, 'video', 'video_list']) as Record<
          string,
          Record<string, unknown>
        >);
      const urls = new Set<string>();
      for (const [formatId, formatDict] of Object.entries(videoList || {})) {
        if (!formatDict || typeof formatDict !== 'object') continue;
        const formatUrl = url_or_none(formatDict.url);
        if (!formatUrl || urls.has(formatUrl)) continue;
        urls.add(formatUrl);
        duration = float_or_none(formatDict.duration, 1000) ?? duration;
        const ext = determine_ext(formatUrl);
        if (formatId.toLowerCase().includes('hls') || ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, formatId);
          formats.push(...res.formats);
        } else {
          formats.push({
            url: formatUrl,
            format_id: formatId,
            width: int_or_none(formatDict.width) ?? undefined,
            height: int_or_none(formatDict.height) ?? undefined,
            duration,
          });
        }
      }
    }

    return {
      id: videoId,
      formats,
      duration,
      webpage_url: `https://www.pinterest.com/pin/${videoId}/`,
      extractor_key: 'Pinterest',
      extractor: 'pinterest',
      ...info,
    };
  }
}

export class PinterestIE extends PinterestBaseIE {
  static IE_NAME = 'pinterest';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE.source}\\/pin\\/(?:[\\w-]+--)?(?<id>\\d+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const resp = await this._callApi('Pin', videoId, { field_set_key: 'unauth_react_main_pin', id: videoId });
    return this._extractVideo((resp.data as Record<string, unknown>) || {});
  }
}

export class PinterestCollectionIE extends PinterestBaseIE {
  static IE_NAME = 'pinterest:collection';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE.source}\\/(?<username>[^/]+)\\/(?<id>[^/?#&]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups?.username!;
    const slug = m.groups?.id!;
    const board = await this._callApi('Board', slug, { slug, username });
    const boardData = (board.data as Record<string, unknown>) || {};
    const boardId = String(boardData.id ?? slug);
    const entries: VideoInfo[] = [];
    let bookmark: string | undefined;

    while (true) {
      const options: Record<string, unknown> = { board_id: boardId, page_size: 250 };
      if (bookmark) options.bookmarks = [bookmark];
      const boardFeed = await this._callApi('BoardFeed', boardId, options);
      for (const item of (boardFeed.data as Array<Record<string, unknown>>) || []) {
        if (item?.type !== 'pin') continue;
        const pinId = str_or_none(item.id);
        if (!pinId) continue;
        entries.push(await this._extractVideo(item));
      }
      bookmark = str_or_none(boardFeed.bookmark) ?? undefined;
      if (!bookmark) break;
    }

    return this.playlist_result(entries, boardId, str_or_none(boardData.name) ?? undefined);
  }
}
