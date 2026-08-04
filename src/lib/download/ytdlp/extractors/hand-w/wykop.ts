// @ts-nocheck
/** WykopBaseIE / WykopDigIE / WykopDigCommentIE / WykopPostIE / WykopPostCommentIE â€?ported from yt-dlp wykop.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, url_or_none } from '../../utils';
import { format_field, parse_iso8601 } from './_helpers';

const bearerCache = new Map<string, string>();

export class WykopBaseIE extends InfoExtractor {
  static IE_NAME = 'wykop:base';
  static _VALID_URL = false as const;

  protected async _getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = bearerCache.get('bearer');
      if (cached) return cached;
    }

    const resp = await this._doCallApi('auth', undefined, 'Downloading anonymous auth token', {
      key: 'w53947240748',
      secret: 'd537d9e0a7adc1510842059ae5316419',
    });
    const newToken = traverse_obj(resp, ['data', 'token']) as string | undefined;
    if (!newToken) throw new ExtractorError('Unable to obtain Wykop auth token');
    bearerCache.set('bearer', newToken);
    return newToken;
  }

  protected async _doCallApi(
    path: string,
    videoId: string | undefined,
    note = 'Downloading JSON metadata',
    data?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const hdrs = { ...headers };
    let body: string | undefined;
    if (data) {
      body = JSON.stringify({ data });
      hdrs['Content-Type'] = 'application/json';
    }
    return this._download_json<Record<string, unknown>>(
      `https://wykop.pl/api/v3/${path}`,
      videoId,
      note,
      { data: body, headers: hdrs },
    );
  }

  protected async _callApi(
    path: string,
    videoId: string,
    note = 'Downloading JSON metadata',
  ): Promise<Record<string, unknown>> {
    let token = await this._getToken();
    for (let retrying = 0; retrying < 2; retrying++) {
      try {
        return await this._doCallApi(path, videoId, note, undefined, {
          Authorization: `Bearer ${token}`,
        });
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        if (!retrying && /HTTP\s*403|status\s*403|403/.test(msg)) {
          token = await this._getToken(true);
          continue;
        }
        throw e;
      }
    }
    throw new ExtractorError('Wykop API call failed');
  }

  protected _commonDataExtract(data: Record<string, unknown>): Partial<VideoInfo> {
    const author = traverse_obj(data, ['author', 'username']) as string | undefined;
    const embedUrl =
      (url_or_none(traverse_obj(data, ['media', 'embed', 'url'])) as string | null) ||
      (url_or_none(traverse_obj(data, ['source', 'url'])) as string | null) ||
      undefined;
    const thumbnail =
      (url_or_none(traverse_obj(data, ['media', 'photo', 'url'])) as string | null) ||
      (url_or_none(traverse_obj(data, ['media', 'embed', 'thumbnail'])) as string | null) ||
      undefined;

    return {
      _type: 'url_transparent',
      display_id: data.slug != null ? String(data.slug) : undefined,
      url: embedUrl,
      thumbnail: thumbnail || undefined,
      uploader: author,
      uploader_id: author,
      uploader_url: author
        ? format_field({ u: author }, 'u', 'https://wykop.pl/ludzie/%s') || undefined
        : undefined,
      timestamp: parse_iso8601(data.created_at) ?? undefined,
      like_count: (traverse_obj(data, ['votes', 'up']) as number) ?? undefined,
      dislike_count: (traverse_obj(data, ['votes', 'down']) as number) ?? undefined,
      comment_count: (traverse_obj(data, ['comments', 'count']) as number) ?? undefined,
      age_limit: data.adult ? 18 : 0,
      tags: data.tags as string[] | undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WykopBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WykopDigIE extends WykopBaseIE {
  static IE_NAME = 'wykop:dig';
  static _VALID_URL = /https?:\/\/(?:www\.)?wykop\.pl\/link\/(?<id>\d+)/;

  static suitable(url: string): boolean {
    return super.suitable(url) && !WykopDigCommentIE.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = (await this._callApi(`links/${videoId}`, videoId)).data as Record<
      string,
      unknown
    >;

    return {
      ...this._commonDataExtract(data),
      id: videoId,
      title: String(data.title || videoId),
      description: data.description != null ? String(data.description) : undefined,
      release_timestamp: parse_iso8601(data.published_at) ?? undefined,
    };
  }
}

export class WykopDigCommentIE extends WykopBaseIE {
  static IE_NAME = 'wykop:dig:comment';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wykop\.pl\/link\/(?<dig_id>\d+)\/[^/]+\/komentarz\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const digId = m.groups!.dig_id!;
    const commentId = m.groups!.id!;
    const data = (
      await this._callApi(`links/${digId}/comments/${commentId}`, commentId)
    ).data as Record<string, unknown>;

    const author = traverse_obj(data, ['author', 'username']);
    return {
      ...this._commonDataExtract(data),
      id: commentId,
      title: `${author || ''} - ${data.content || ''}`,
      description: data.content != null ? String(data.content) : undefined,
    };
  }
}

export class WykopPostIE extends WykopBaseIE {
  static IE_NAME = 'wykop:post';
  static _VALID_URL = /https?:\/\/(?:www\.)?wykop\.pl\/wpis\/(?<id>\d+)/;

  static suitable(url: string): boolean {
    return super.suitable(url) && !WykopPostCommentIE.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = (await this._callApi(`entries/${videoId}`, videoId)).data as Record<
      string,
      unknown
    >;
    const author = traverse_obj(data, ['author', 'username']);
    return {
      ...this._commonDataExtract(data),
      id: videoId,
      title: `${author || ''} - ${data.content || ''}`,
      description: data.content != null ? String(data.content) : undefined,
    };
  }
}

export class WykopPostCommentIE extends WykopBaseIE {
  static IE_NAME = 'wykop:post:comment';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?wykop\.pl\/wpis\/(?<post_id>\d+)\/[^/#]+#(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const postId = m.groups!.post_id!;
    const commentId = m.groups!.id!;
    const data = (
      await this._callApi(`entries/${postId}/comments/${commentId}`, commentId)
    ).data as Record<string, unknown>;
    const author = traverse_obj(data, ['author', 'username']);
    return {
      ...this._commonDataExtract(data),
      id: commentId,
      title: `${author || ''} - ${data.content || ''}`,
      description: data.content != null ? String(data.content) : undefined,
    };
  }
}
