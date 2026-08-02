/**
 * Instagram sibling IEs — ported from yt-dlp instagram.py
 *
 * InstagramIE itself lives in extractors/more-sites.ts — not re-exported here.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  filter_dict,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { format_field, md5Hex } from './_helpers';

const IG_ENCODING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function pkToId(mediaId: unknown): string {
  const pk = BigInt(String(mediaId).split('_')[0]!);
  let out = '';
  let n = pk;
  const base = BigInt(64);
  if (n === BigInt(0)) return IG_ENCODING_CHARS[0]!;
  while (n > BigInt(0)) {
    out = IG_ENCODING_CHARS[Number(n % base)] + out;
    n = n / base;
  }
  return out;
}

export class InstagramBaseIE extends InfoExtractor {
  static IE_NAME = 'instagrambase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _BASE_URL = 'https://www.instagram.com/';
  protected _APP_IDS = { ios: '124024574287414', web: '936619743392459' };
  protected _AUTH_COOKIE_NAME = 'sessionid';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('InstagramBaseIE is not a standalone extractor', { expected: true });
  }

  protected get _isLoggedIn(): boolean {
    return Boolean(this._get_cookies(this._BASE_URL)[this._AUTH_COOKIE_NAME]);
  }

  protected get _appId(): string {
    return this._APP_IDS.web;
  }

  protected get _apiBaseUrl(): string {
    return 'https://www.instagram.com/api/v1';
  }

  protected get _apiHeaders(): Record<string, string> {
    return {
      'X-IG-App-ID': this._appId,
      'X-ASBD-ID': '359341',
      'X-IG-WWW-Claim': '0',
      Origin: 'https://www.instagram.com',
      Accept: '*/*',
    };
  }

  protected _getCount(media: Record<string, unknown>, kind: string, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const val = traverse_obj(media, [`edge_media_${key}`, 'count']);
      if (val != null) return int_or_none(val) ?? undefined;
    }
    const direct = traverse_obj(media, [kind, 'count']);
    return int_or_none(direct) ?? undefined;
  }

  protected _getDimension(name: string, media: Record<string, unknown>, webpage?: string): number | undefined {
    return (
      int_or_none(traverse_obj(media, ['dimensions', name])) ??
      int_or_none(this._html_search_meta(`og:video:${name}`, webpage || '', undefined, false)) ??
      undefined
    );
  }

  protected *_extractNodes(
    nodes: Array<Record<string, unknown>>,
    isDirect = false,
  ): Generator<Partial<VideoInfo>> {
    for (const [idx, node] of nodes.entries()) {
      if (node.__typename !== 'GraphVideo' && node.is_video !== true) continue;
      const videoId = node.shortcode != null ? String(node.shortcode) : undefined;
      let info: Partial<VideoInfo>;
      if (isDirect) {
        info = {
          id: videoId || String(node.id),
          url: node.video_url != null ? String(node.video_url) : undefined,
          width: this._getDimension('width', node),
          height: this._getDimension('height', node),
          http_headers: { Referer: 'https://www.instagram.com/' },
        };
      } else if (!videoId) {
        continue;
      } else {
        info = this.url_result(`https://instagram.com/p/${videoId}`, 'Instagram', videoId);
      }
      yield {
        ...info,
        title: node.title != null ? String(node.title) : isDirect ? `Video ${idx + 1}` : undefined,
        description: traverse_obj(node, ['edge_media_to_caption', 'edges', 0, 'node', 'text']) as
          | string
          | undefined,
        thumbnail:
          url_or_none(node.display_url) ||
          url_or_none(node.thumbnail_src) ||
          url_or_none(node.display_src) ||
          undefined,
        duration: float_or_none(node.video_duration) ?? undefined,
        timestamp: int_or_none(node.taken_at_timestamp) ?? undefined,
        view_count: int_or_none(node.video_view_count) ?? undefined,
        comment_count: this._getCount(node, 'comments', 'preview_comment', 'to_comment', 'to_parent_comment'),
        like_count: this._getCount(node, 'likes', 'preview_like'),
      };
    }
  }

  protected _extractProductMedia(productMedia: Record<string, unknown>): Partial<VideoInfo> {
    const videoId = pkToId(productMedia.pk);
    const formats: Format[] = [];
    for (const v of (productMedia.video_versions as Array<Record<string, unknown>>) || []) {
      const u = url_or_none(v.url);
      if (!u) continue;
      formats.push({
        url: u,
        format_id: v.id != null ? String(v.id) : v.type != null ? String(v.type) : `http-${formats.length}`,
        width: int_or_none(v.width) ?? undefined,
        height: int_or_none(v.height) ?? undefined,
        vcodec: productMedia.video_codec != null ? String(productMedia.video_codec) : undefined,
        acodec: productMedia.has_audio === false ? 'none' : undefined,
      });
    }

    const dash = productMedia.video_dash_manifest != null ? String(productMedia.video_dash_manifest) : '';
    if (dash) {
      this.report_warning('DASH manifest parsing is not supported in this port');
    }

    const thumbnails: Thumbnail[] = (
      (productMedia.image_versions2 as Record<string, unknown>)?.candidates as Array<Record<string, unknown>>
    )
      ?.map((c) => ({
        url: url_or_none(c.url) || '',
        width: int_or_none(c.width) ?? undefined,
        height: int_or_none(c.height) ?? undefined,
      }))
      .filter((t) => t.url)
      .reverse() || [];

    return {
      id: videoId,
      formats,
      duration: float_or_none(productMedia.video_duration) ?? undefined,
      thumbnails,
    };
  }

  protected _extractProduct(
    productInfo: Record<string, unknown> | Array<Record<string, unknown>>,
    videoId?: string,
  ): VideoInfo {
    const info = Array.isArray(productInfo) ? productInfo[0]! : productInfo;
    const infoDict: Partial<VideoInfo> = {
      id: videoId,
      title: format_field({ username: traverse_obj(info, ['user', 'username']) as string }, 'username', 'Video by %s') ||
        undefined,
      description: traverse_obj(info, ['caption', 'text']) as string | undefined,
      channel: traverse_obj(info, ['user', 'username']) as string | undefined,
      uploader_id: str_or_none(traverse_obj(info, ['user', 'pk'])) ?? undefined,
      uploader: traverse_obj(info, ['user', 'full_name']) as string | undefined,
      timestamp: int_or_none(info.taken_at) ?? undefined,
      view_count: int_or_none(info.view_count) ?? undefined,
      like_count: int_or_none(info.like_count) ?? undefined,
      comment_count: int_or_none(info.comment_count) ?? undefined,
      http_headers: { Referer: 'https://www.instagram.com/' },
    };
    if (info.pk) infoDict.id = pkToId(info.pk);

    const carousel = info.carousel_media as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(carousel) && carousel.length) {
      return this.playlist_result(
        carousel.map(
          (productMedia) =>
            ({
              ...infoDict,
              ...this._extractProductMedia(productMedia),
            }) as VideoInfo,
        ),
        infoDict.id || videoId || 'carousel',
        format_field({ channel: infoDict.channel }, 'channel', 'Post by %s') || infoDict.title || undefined,
        infoDict.description || null,
      );
    }

    return { ...infoDict, ...this._extractProductMedia(info) } as VideoInfo;
  }
}

export class InstagramIOSIE extends InfoExtractor {
  static IE_NAME = 'instagramios';
  static IE_DESC = 'IOS instagram:// URL';
  static _VALID_URL = /instagram:\/\/media\?id=(?<id>[\d_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = pkToId(this._match_id(url));
    return this.url_result(`http://instagram.com/tv/${videoId}`, 'Instagram', videoId);
  }
}

export class InstagramPlaylistBaseIE extends InstagramBaseIE {
  static IE_NAME = 'instagramplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _QUERY_HASH = '';
  protected _gisTmpl: string | null = null;

  protected _parseGraphql(webpage: string, itemId: string): Record<string, unknown> {
    return (
      this._parse_json<Record<string, unknown>>(
        this._search_regex(/sharedData\s*=\s*(\{.+?\})\s*;\s*[<\n]/, webpage, 'data')!,
        itemId,
      ) || {}
    );
  }

  protected _parseTimelineFrom(_data: Record<string, unknown>): Record<string, unknown> {
    return {};
  }

  protected _queryVarsFor(_data: Record<string, unknown>): Record<string, unknown> {
    return {};
  }

  protected async *_extractGraphql(data: Record<string, unknown>, url: string): AsyncGenerator<Partial<VideoInfo>> {
    const uploaderId = this._match_id(url);
    const csrfToken = traverse_obj(data, ['config', 'csrf_token']) as string;
    const rhxGis = (traverse_obj(data, ['rhx_gis']) as string) || '3c7ca9dcefcf966d11dacf1f151335e8';
    let cursor = '';

    for (let pageNum = 1; ; pageNum++) {
      const variables = JSON.stringify({
        first: 12,
        after: cursor,
        ...this._queryVarsFor(data),
      });

      const gisTmpls = this._gisTmpl
        ? [this._gisTmpl]
        : [
            rhxGis,
            '',
            `${rhxGis}:${csrfToken}`,
            `${rhxGis}:${csrfToken}:${this.params.http_headers?.['User-Agent'] || ''}`,
          ];

      let media: Record<string, unknown> | undefined;
      for (const gisTmpl of gisTmpls) {
        try {
          const jsonData = await this._download_json<Record<string, unknown>>(
            'https://www.instagram.com/graphql/query/',
            uploaderId,
            `Downloading JSON page ${pageNum}`,
            {
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-Instagram-GIS': md5Hex(`${gisTmpl}:${variables}`),
              },
              query: {
                query_hash: this._QUERY_HASH,
                variables,
              },
            },
          );
          media = this._parseTimelineFrom(jsonData);
          this._gisTmpl = gisTmpl;
          break;
        } catch (e) {
          const status = (e as { cause?: { status?: number } }).cause?.status;
          if (status === 403 && gisTmpl !== gisTmpls[gisTmpls.length - 1]) continue;
          throw e;
        }
      }

      const edges = (media?.edges as Array<{ node?: Record<string, unknown> }>) || [];
      const nodes = edges.map((e) => e.node).filter((n): n is Record<string, unknown> => Boolean(n));
      if (!nodes.length) break;
      yield* this._extractNodes(nodes);

      const hasNext = traverse_obj(media, ['page_info', 'has_next_page']);
      cursor = String(traverse_obj(media, ['page_info', 'end_cursor']) || '');
      if (!hasNext || !cursor) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userOrTag = this._match_id(url);
    const webpage = await this._download_webpage(url, userOrTag);
    const data = this._parseGraphql(webpage, userOrTag);
    const entries: VideoInfo[] = [];
    for await (const entry of this._extractGraphql(data, url)) {
      entries.push(entry as VideoInfo);
    }
    return this.playlist_result(entries, userOrTag, userOrTag);
  }
}

export class InstagramUserIE extends InstagramPlaylistBaseIE {
  static IE_NAME = 'instagram:user';
  static IE_DESC = 'Instagram user profile';
  static _VALID_URL = /https?:\/\/(?:www\.)?instagram\.com\/(?<id>[^/]{2,})\/?(?:$|[?#])/;

  protected _QUERY_HASH = '42323d64886122307be10013ad2dcc44';

  protected _parseTimelineFrom(data: Record<string, unknown>): Record<string, unknown> {
    return traverse_obj(data, ['data', 'user', 'edge_owner_to_timeline_media']) as Record<string, unknown>;
  }

  protected _queryVarsFor(data: Record<string, unknown>): Record<string, unknown> {
    return {
      id: traverse_obj(data, ['entry_data', 'ProfilePage', 0, 'graphql', 'user', 'id']),
    };
  }
}

export class InstagramTagIE extends InstagramPlaylistBaseIE {
  static IE_NAME = 'instagram:tag';
  static IE_DESC = 'Instagram hashtag search URLs';
  static _VALID_URL = /https?:\/\/(?:www\.)?instagram\.com\/explore\/tags\/(?<id>[^/]+)/;

  protected _QUERY_HASH = 'f92f56d47dc7a55b606908374b43a314';

  protected _parseTimelineFrom(data: Record<string, unknown>): Record<string, unknown> {
    return traverse_obj(data, ['data', 'hashtag', 'edge_hashtag_to_media']) as Record<string, unknown>;
  }

  protected _queryVarsFor(data: Record<string, unknown>): Record<string, unknown> {
    return {
      tag_name: traverse_obj(data, ['entry_data', 'TagPage', 0, 'graphql', 'hashtag', 'name']),
    };
  }
}

export class InstagramStoryIE extends InstagramBaseIE {
  static IE_NAME = 'instagram:story';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?instagram\.com\/stories\/(?<user>[^/?#]+)(?:\/(?<id>\d+))?/;

  protected _yesPlaylist(_playlistId: string, itemId: string | null): boolean {
    if (this.params.noplaylist) {
      if (itemId) this.to_screen('Downloading just story because of --no-playlist');
      return false;
    }
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups!.user!;
    const storyId = m.groups!.id || null;
    if (username === 'highlights' && !storyId) {
      throw new ExtractorError('Input URL is missing a highlight ID', { expected: true });
    }

    const displayId = storyId || username;
    const storyInfo = await this._download_webpage(url, displayId);
    const userInfo = this._search_json<Record<string, unknown>>(/"user":/, storyInfo, 'user info', displayId, {
      fatal: false,
    });
    if (!userInfo) this.raise_login_required('This content is unreachable');

    const userId = str_or_none(traverse_obj(userInfo, ['pk', 'id']));
    const storyInfoUrl = username === 'highlights' ? `highlight:${storyId}` : userId;
    if (username !== 'highlights' && !userId) {
      throw new ExtractorError('Unable to extract user id', { expected: true });
    }

    const videos = traverse_obj(
      await this._download_json<Record<string, unknown>>(
        `${this._apiBaseUrl}/feed/reels_media/?reel_ids=${storyInfoUrl}`,
        displayId,
        undefined,
        { headers: this._apiHeaders, fatal: false },
      ),
      ['reels'],
    ) as Record<string, unknown> | undefined;

    if (!videos) this.raise_login_required('You need to log in to access this content');

    const userBlock = (traverse_obj(videos, [userId || '', 'user']) as Record<string, unknown>) || {};
    const fullName =
      (traverse_obj(videos, [`highlight:${storyId}`, 'user', 'full_name']) as string | undefined) ||
      (traverse_obj(videos, [userId || '', 'user', 'full_name']) as string | undefined);
    let storyTitle = traverse_obj(videos, [`highlight:${storyId}`, 'title']) as string | undefined;
    if (!storyTitle) storyTitle = `Story by ${username}`;

    const highlights =
      (traverse_obj(videos, [`highlight:${storyId}`, 'items']) as Array<Record<string, unknown>>) ||
      (traverse_obj(videos, [userId || '', 'items']) as Array<Record<string, unknown>>) ||
      [];

    const infoData: VideoInfo[] = [];
    for (const highlight of highlights) {
      highlight.user = { ...(highlight.user as Record<string, unknown>), ...userBlock };
      const highlightData = this._extractProduct(highlight);
      if (highlightData.formats?.length) {
        infoData.push(
          filter_dict({
            uploader: fullName,
            uploader_id: userId,
            ...highlightData,
          }) as VideoInfo,
        );
      }
    }

    if (username !== 'highlights' && storyId && !this._yesPlaylist(username, storyId)) {
      const targetId = pkToId(storyId);
      const single = infoData.find((v) => v.id === targetId);
      if (single) return single;
    }

    return this.playlist_result(infoData, storyId, storyTitle);
  }
}
