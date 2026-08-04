// @ts-nocheck
/** YouNowLiveIE / YouNowChannelIE / YouNowMomentIE â€?ported from yt-dlp younow.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, try_get } from '../../utils';
import { format_field } from './_helpers';

const CDN_API_BASE = 'https://cdn.younow.com/php/api';
const MOMENT_URL_FORMAT = `${CDN_API_BASE}/moment/fetch/id=%s`;

function extractMoment(item: Record<string, unknown>, fatal = true): VideoInfo | null {
  let momentId = item.momentId;
  if (momentId == null) {
    if (!fatal) return null;
    throw new ExtractorError('Unable to extract moment id');
  }
  momentId = String(momentId);

  let title = item.text != null ? String(item.text) : '';
  if (!title) {
    title = `YouNow ${String(item.momentType || item.titleType || 'moment')}`;
  }

  const uploader = try_get(item, (x) => String((x.owner as Record<string, unknown>)?.name));
  const uploaderId = try_get(item, (x) => (x.owner as Record<string, unknown>)?.userId);
  const uploaderUrl = uploader
    ? format_field({ uploader }, 'uploader', 'https://www.younow.com/%s')
    : null;

  return {
    extractor_key: 'YouNowMoment',
    id: momentId,
    title,
    view_count: int_or_none(item.views) ?? undefined,
    like_count: int_or_none(item.likes) ?? undefined,
    timestamp: int_or_none(item.created) ?? undefined,
    creator: uploader || undefined,
    uploader: uploader || undefined,
    uploader_id: str_or_none(uploaderId) || undefined,
    uploader_url: uploaderUrl || undefined,
    formats: [
      {
        url: `https://hls.younow.com/momentsplaylists/live/${momentId}/${momentId}.m3u8`,
        ext: 'mp4',
        protocol: 'm3u8_native',
      },
    ],
  };
}

export class YouNowChannelIE extends InfoExtractor {
  static IE_NAME = 'YouNowChannel';
  static _VALID_URL = /https?:\/\/(?:www\.)?younow\.com\/(?<id>[^/]+)\/channel/;

  protected async *_entries(username: string, channelId: string): AsyncGenerator<VideoInfo> {
    let createdBefore: number | null = 0;
    for (let pageNum = 1; pageNum < 500; pageNum++) {
      if (createdBefore == null) break;
      const info = await this._download_json<{ items?: unknown[] }>(
        `${CDN_API_BASE}/moment/profile/channelId=${channelId}/createdBefore=${createdBefore}/records=20`,
        username,
        `Downloading moments page ${pageNum}`,
      );
      const items = info.items;
      if (!items || !Array.isArray(items)) break;

      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const itemType = item.type;
        if (itemType === 'moment') {
          const entry = extractMoment(item, false);
          if (entry) yield entry;
        } else if (itemType === 'collection') {
          const moments = item.momentsIds;
          if (Array.isArray(moments)) {
            for (const momentId of moments) {
              const m = await this._download_json<{ item?: Record<string, unknown> }>(
                MOMENT_URL_FORMAT.replace('%s', String(momentId)),
                username,
                `Downloading ${momentId} moment JSON`,
                { fatal: false },
              );
              if (m?.item && typeof m.item === 'object') {
                const entry = extractMoment(m.item);
                if (entry) yield entry;
              }
            }
          }
        }
        createdBefore = int_or_none(item.created);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const username = this._match_id(url);
    const userInfo = await this._download_json<{ userId: number | string }>(
      `https://api.younow.com/php/api/broadcast/info/curId=0/user=${username}`,
      username,
      'Downloading user information',
    );
    const channelId = String(userInfo.userId);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(username, channelId)) {
      entries.push(entry);
    }
    return this.playlist_result(entries, channelId, `${username} moments`);
  }
}

export class YouNowMomentIE extends InfoExtractor {
  static IE_NAME = 'YouNowMoment';
  static _VALID_URL = /https?:\/\/(?:www\.)?younow\.com\/[^/]+\/(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    return !YouNowChannelIE.suitable(url) && super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const item = await this._download_json<{ item: Record<string, unknown> }>(
      MOMENT_URL_FORMAT.replace('%s', videoId),
      videoId,
    );
    return extractMoment(item.item)!;
  }
}

export class YouNowLiveIE extends InfoExtractor {
  static IE_NAME = 'YouNowLive';
  static _VALID_URL = /https?:\/\/(?:www\.)?younow\.com\/(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    return (
      !YouNowChannelIE.suitable(url) &&
      !YouNowMomentIE.suitable(url) &&
      super.suitable(url)
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const username = this._match_id(url);

    const data = await this._download_json<Record<string, unknown>>(
      `https://api.younow.com/php/api/broadcast/info/curId=0/user=${username}`,
      username,
    );

    if (data.errorCode !== 0) {
      throw new ExtractorError(String(data.errorMsg || 'YouNow error'), { expected: true });
    }

    const uploader =
      try_get(data, (x) => String((x.user as Record<string, unknown>)?.profileUrlString)) ||
      username;

    const formats: Format[] = [
      {
        url: `${CDN_API_BASE}/broadcast/videoPath/hls=1/broadcastId=${data.broadcastId}/channelId=${data.userId}`,
        ext: 'mp4',
        protocol: 'm3u8',
      },
    ];

    return {
      id: uploader,
      is_live: true,
      title: uploader,
      thumbnail: data.awsUrl != null ? String(data.awsUrl) : undefined,
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
      categories: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
      uploader,
      uploader_id: data.userId != null ? String(data.userId) : undefined,
      uploader_url: `https://www.younow.com/${username}`,
      creator: uploader,
      view_count: int_or_none(data.viewers) ?? undefined,
      like_count: int_or_none(data.likes) ?? undefined,
      formats,
    };
  }
}
