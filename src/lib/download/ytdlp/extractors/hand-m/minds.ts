// @ts-nocheck
/**
 * MindsBaseIE / MindsIE / MindsChannelIE / MindsGroupIE — ported from yt-dlp minds.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none } from '../../utils';
import { format_field, strip_or_none } from './_helpers';

export class MindsBaseIE extends InfoExtractor {
  static IE_NAME = 'mindsbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('MindsBaseIE is not a standalone extractor');
  }

  protected async _callApi(
    path: string,
    videoId: string,
    resource: string,
    query?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const apiUrl = `https://www.minds.com/api/${path}`;
    const cookies = this._get_cookies(apiUrl);
    const token = cookies['XSRF-TOKEN'];
    return this._download_json(apiUrl, videoId, `Downloading ${resource} JSON metadata`, {
      headers: {
        Referer: 'https://www.minds.com/',
        'X-XSRF-TOKEN': token || '',
      },
      query,
    });
  }
}

export class MindsIE extends MindsBaseIE {
  static IE_NAME = 'minds';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?minds\.com\/(?:media|newsfeed|archive\/view)\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const entityId = this._match_id(url);
    let entity = ((await this._callApi(`v1/entities/entity/${entityId}`, entityId, 'entity')).entity ||
      {}) as Record<string, unknown>;

    let videoId: string;
    if (entity.type === 'activity') {
      if (entity.custom_type === 'video') {
        videoId = String(entity.entity_guid ?? entityId);
      } else {
        return this.url_result(String(entity.perma_url ?? url));
      }
    } else {
      videoId = entityId;
    }

    const video = ((await this._callApi(`v2/media/video/${videoId}`, videoId, 'video')) || {}) as Record<
      string,
      unknown
    >;
    const formats: Format[] = [];
    for (const source of (video.sources as Array<Record<string, unknown>>) || []) {
      const src = source.src as string | undefined;
      if (!src) continue;
      formats.push({
        format_id: str_or_none(source.label) || 'http',
        height: int_or_none(source.size) ?? undefined,
        url: src,
      });
    }

    entity = (video.entity as Record<string, unknown>) || entity;
    const owner = (entity.ownerObj as Record<string, unknown>) || {};
    const uploaderId = str_or_none(owner.username);
    let tags = entity.tags as string[] | string | undefined;
    if (tags && typeof tags === 'string') tags = [tags];

    let thumbnail: string | undefined;
    const poster = (video.poster as string | undefined) || (entity.thumbnail_src as string | undefined);
    if (poster) {
      const resp = await this._request_webpage(poster, videoId, undefined, { fatal: false });
      if (resp?.url) thumbnail = resp.url;
    }

    return {
      id: videoId,
      title: str_or_none(entity.title) || videoId,
      formats,
      description: clean_html(str_or_none(entity.description)) || undefined,
      license: str_or_none(entity.license) ?? undefined,
      timestamp: int_or_none(entity.time_created) ?? undefined,
      uploader: strip_or_none(owner.name) ?? undefined,
      uploader_id: uploaderId ?? undefined,
      uploader_url: format_field({ username: uploaderId }, 'username', 'https://www.minds.com/%s') || undefined,
      view_count: int_or_none(entity['play:count']) ?? undefined,
      like_count: int_or_none(entity['thumbs:up:count']) ?? undefined,
      dislike_count: int_or_none(entity['thumbs:down:count']) ?? undefined,
      tags: tags as string[] | undefined,
      comment_count: int_or_none(entity['comments:count']) ?? undefined,
      thumbnail,
    };
  }
}

export abstract class MindsFeedBaseIE extends MindsBaseIE {
  static IE_NAME = 'minds:feed';
  static _VALID_URL = false as const;
  static _PAGE_SIZE = 150;
  protected abstract readonly _FEED_TYPE: string;
  protected abstract readonly _FEED_PATH: string;

  protected async *_entries(feedId: string): AsyncGenerator<VideoInfo> {
    const query: Record<string, string> = { limit: String(MindsFeedBaseIE._PAGE_SIZE), sync: '1' };
    let i = 1;
    while (true) {
      const data = await this._callApi(
        `v2/feeds/container/${feedId}/videos`,
        feedId,
        `page ${i}`,
        query,
      );
      const entities = (data.entities as Array<Record<string, unknown>>) || [];
      for (const entity of entities) {
        const guid = str_or_none(entity.guid);
        if (!guid) continue;
        yield this.url_result(`https://www.minds.com/newsfeed/${guid}`, 'minds', guid);
      }
      query.from_timestamp = String(data['load-next'] ?? '');
      if (!(query.from_timestamp && entities.length === MindsFeedBaseIE._PAGE_SIZE)) break;
      i += 1;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const feedId = this._match_id(url);
    const feedResp = await this._callApi(`v1/${this._FEED_PATH}/${feedId}`, feedId, this._FEED_TYPE);
    const feed = (feedResp[this._FEED_TYPE] as Record<string, unknown>) || {};
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(String(feed.guid ?? feedId))) {
      entries.push(entry);
    }
    return this.playlist_result(
      entries,
      feedId,
      strip_or_none(feed.name) ?? undefined,
      str_or_none(feed.briefdescription) ?? undefined,
    );
  }
}

export class MindsChannelIE extends MindsFeedBaseIE {
  static IE_NAME = 'minds:channel';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?minds\.com\/(?!(?:newsfeed|media|api|archive|groups)\/)(?<id>[^/?&#]+)/;
  protected readonly _FEED_TYPE = 'channel';
  protected readonly _FEED_PATH = 'channel';
}

export class MindsGroupIE extends MindsFeedBaseIE {
  static IE_NAME = 'minds:group';
  static _VALID_URL = /https?:\/\/(?:www\.)?minds\.com\/groups\/profile\/(?<id>[0-9]+)/;
  protected readonly _FEED_TYPE = 'group';
  protected readonly _FEED_PATH = 'groups/group';
}
