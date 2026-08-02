/**
 * BanByeIE family — ported from yt-dlp banbye.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';

const API_BASE = 'https://api.banbye.com';
const CDN_BASE = 'https://cdn.banbye.com';
const VIDEO_BASE = 'https://banbye.com/watch';

export class BanByeBaseIE extends InfoExtractor {
  static IE_NAME = 'banbyebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BanByeBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractPlaylistId(url: string, param = 'playlist'): string | null {
    try {
      return new URL(url).searchParams.get(param);
    } catch {
      return null;
    }
  }

  protected async _extractPlaylist(playlistId: string): Promise<VideoInfo> {
    const data = await this._download_json<{ videoIds?: string[]; name?: string }>(
      `${API_BASE}/playlists/${playlistId}`,
      playlistId,
    );
    return this.playlist_result(
      (data.videoIds || []).map((videoId) => this.url_result(`${VIDEO_BASE}/${videoId}`, 'BanBye', videoId)),
      playlistId,
      data.name || null,
    );
  }
}

export class BanByeIE extends BanByeBaseIE {
  static IE_NAME = 'banbye';
  static _VALID_URL = /https?:\/\/(?:www\.)?banbye\.com\/(?:en\/)?watch\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const playlistId = this._extractPlaylistId(url, 'playlistId');
    if (playlistId) return this._extractPlaylist(playlistId);

    const data = await this._download_json<Record<string, unknown>>(`${API_BASE}/videos/${videoId}`, videoId);

    const thumbnails = [48, 96, 144, 240, 512, 1080].map((quality) => ({
      id: `${quality}p`,
      url: `${CDN_BASE}/video/${videoId}/${quality}.webp`,
    }));

    let formats: Format[] = [];
    const urlData = await this._download_json<Record<string, unknown>>(
      `${API_BASE}/videos/${videoId}/url`,
      videoId,
      undefined,
      { method: 'POST', data: '' },
    );

    const masterUrl = url_or_none(traverse_obj(urlData, ['src', 'hls', 'masterPlaylist']));
    if (masterUrl) {
      formats = await this._extract_m3u8_formats(
        masterUrl,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
    }

    const src = (urlData.src as Record<string, Record<string, unknown>>) || {};
    for (const key of ['mp4', 'hls'] as const) {
      const levels = (src[key]?.levels as Record<string, unknown>) || {};
      for (const [formatId, formatUrlRaw] of Object.entries(levels)) {
        const formatUrl = url_or_none(formatUrlRaw);
        if (!formatUrl) continue;
        const ext = determine_ext(formatUrl);
        const isHls = ext === 'm3u8';
        formats.push({
          format_id: [isHls ? 'hls' : null, formatId].filter(Boolean).join('-'),
          url: formatUrl,
          ext: isHls ? 'mp4' : ext,
          protocol: isHls ? 'm3u8_native' : 'https',
          height: int_or_none(formatId),
        });
      }
    }

    const seen = new Set<string>();
    formats = formats.filter((f) => {
      if (!f.url || seen.has(f.url)) return false;
      seen.add(f.url);
      return true;
    });

    return {
      id: videoId,
      title: (data.title as string) || undefined,
      description: (data.desc as string) || undefined,
      uploader: (traverse_obj(data, ['channel', 'name']) as string | undefined) || undefined,
      channel_id: (data.channelId as string) || undefined,
      channel_url: data.channelId ? `https://banbye.com/channel/${data.channelId}` : undefined,
      timestamp: unified_timestamp(data.publishedAt) ?? undefined,
      duration: (data.duration as number) ?? undefined,
      tags: (data.tags as string[]) || undefined,
      formats,
      thumbnails,
      like_count: (data.likes as number) ?? undefined,
      dislike_count: (data.dislikes as number) ?? undefined,
      view_count: (data.views as number) ?? undefined,
      comment_count: (data.commentCount as number) ?? undefined,
    };
  }
}

export class BanByeChannelIE extends BanByeBaseIE {
  static IE_NAME = 'banbye:channel';
  static _VALID_URL = /https?:\/\/(?:www\.)?banbye\.com\/(?:en\/)?channel\/(?<id>\w+)/;
  static _PAGE_SIZE = 100;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const playlistId = this._extractPlaylistId(url);
    if (playlistId) return this._extractPlaylist(playlistId);

    const channelData = await this._download_json<Record<string, unknown>>(
      `${API_BASE}/channels/${channelId}`,
      channelId,
    );
    const pageSize = BanByeChannelIE._PAGE_SIZE;
    const totalPages = Math.ceil(Number(channelData.videoCount || 0) / pageSize) || 0;

    const entries: VideoInfo[] = [];
    for (let page = 0; page < totalPages; page++) {
      const data = await this._download_json<{ items?: Array<{ _id: string }> }>(
        `${API_BASE}/videos`,
        channelId,
        `Downloading page ${page + 1}`,
        {
          query: {
            channelId,
            sort: 'new',
            limit: String(pageSize),
            offset: String(page * pageSize),
          },
        },
      );
      for (const video of data.items || []) {
        entries.push(this.url_result(`${VIDEO_BASE}/${video._id}`, 'BanBye', video._id));
      }
    }

    return this.playlist_result(
      entries,
      channelId,
      (channelData.name as string) || null,
      (channelData.description as string) || null,
    );
  }
}
