/**
 * KickBaseIE / KickIE / KickVODIE / KickClipIE — ported from yt-dlp kick.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parseIso8601, UserNotLive } from './_helpers';

export class KickBaseIE extends InfoExtractor {
  static IE_NAME = 'kickbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('KickBaseIE is not a standalone extractor', { expected: true });
  }

  protected _apiHeaders(): Record<string, string> {
    const cookies = this._get_cookies('https://kick.com/');
    const token = cookies.session_token;
    if (token) {
      try {
        return { Authorization: `Bearer ${decodeURIComponent(token)}` };
      } catch {
        return { Authorization: `Bearer ${token}` };
      }
    }
    return {};
  }

  protected async _callApi(
    path: string,
    displayId: string,
    note = 'Downloading API JSON',
    headers: Record<string, string> = {},
    query?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(`https://kick.com/api/${path}`, displayId, note, {
      headers: { ...this._apiHeaders(), ...headers },
      query,
    });
  }
}

export class KickIE extends KickBaseIE {
  static IE_NAME = 'kick:live';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?kick\.com\/(?!(?:video|categories|search|auth)(?:[/?#]|$))(?<id>[\w-]+)/;

  static suitable(url: string): boolean {
    if (KickVODIE.suitable(url) || KickClipIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channel = this._match_id(url);
    const response = await this._callApi(`v2/channels/${channel}`, channel);
    if (!traverse_obj(response, ['livestream']) || typeof response.livestream !== 'object') {
      throw new UserNotLive(channel);
    }

    const formats = await this._extract_m3u8_formats(
      String(response.playback_url ?? ''),
      channel,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
      undefined,
      true,
    );

    const livestream = response.livestream as Record<string, unknown>;
    const user = response.user as Record<string, unknown> | undefined;
    const isMature = !!livestream.is_mature;

    return {
      channel,
      is_live: true,
      formats,
      id: str_or_none(livestream.slug) ?? channel,
      title: str_or_none(livestream.session_title) ?? undefined,
      description: str_or_none(user?.bio) ?? undefined,
      channel_id: str_or_none(response.id ?? livestream.channel_id) ?? undefined,
      uploader: str_or_none(response.name ?? user?.username) ?? undefined,
      uploader_id: str_or_none(response.user_id ?? user?.id) ?? undefined,
      timestamp: unified_timestamp(livestream.created_at) ?? undefined,
      release_timestamp: unified_timestamp(livestream.start_time) ?? undefined,
      thumbnail: url_or_none(traverse_obj(livestream, ['thumbnail', 'url'])) ?? undefined,
      categories: ((response.recent_categories as Array<Record<string, unknown>>) || [])
        .map((c) => str_or_none(c.name))
        .filter(Boolean) as string[],
      concurrent_view_count: int_or_none(livestream.viewer_count) ?? undefined,
      age_limit: isMature ? 18 : 0,
    };
  }
}

export class KickVODIE extends KickBaseIE {
  static IE_NAME = 'kick:vod';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?kick\.com\/[\w-]+\/videos\/(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const response = await this._callApi(`v1/video/${videoId}`, videoId);
    const formats = await this._extract_m3u8_formats(
      String(response.source ?? ''),
      videoId,
      'mp4',
      'm3u8_native',
    );

    const livestream = (response.livestream as Record<string, unknown>) || {};
    const channel = (livestream.channel as Record<string, unknown>) || {};
    const channelUser = (channel.user as Record<string, unknown>) || {};
    const isMature = !!livestream.is_mature;

    return {
      id: videoId,
      formats,
      title:
        str_or_none(livestream.session_title) ||
        str_or_none(livestream.slug) ||
        undefined,
      description: str_or_none(channelUser.bio) ?? undefined,
      channel: str_or_none(channel.slug) ?? undefined,
      channel_id: str_or_none(channel.id) ?? undefined,
      uploader: str_or_none(channelUser.username) ?? undefined,
      uploader_id: str_or_none(channel.user_id) ?? undefined,
      timestamp: parseIso8601(response.created_at) ?? undefined,
      duration: float_or_none(livestream.duration, 1000) ?? undefined,
      thumbnail: url_or_none(livestream.thumbnail) ?? undefined,
      categories: ((livestream.categories as Array<Record<string, unknown>>) || [])
        .map((c) => str_or_none(c.name))
        .filter(Boolean) as string[],
      view_count: int_or_none(response.views) ?? undefined,
      age_limit: isMature ? 18 : 0,
      is_live: !!livestream.is_live,
    };
  }
}

export class KickClipIE extends KickBaseIE {
  static IE_NAME = 'kick:clips';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?kick\.com\/[\w-]+(?:\/clips\/|(?:\/)\?(?:[^#]+&)?clip=)(?<id>clip_[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const clipId = this._match_id(url);
    const resp = await this._callApi(`v2/clips/${clipId}/play`, clipId);
    const clip = (resp.clip as Record<string, unknown>) || {};
    const clipUrl = String(clip.clip_url ?? '');

    let formats: Format[];
    if (determine_ext(clipUrl) === 'm3u8') {
      formats = await this._extract_m3u8_formats(clipUrl, clipId, 'mp4', 'm3u8_native');
    } else {
      formats = [{ url: clipUrl, format_id: 'http' }];
    }

    const channel = (clip.channel as Record<string, unknown>) || {};
    const creator = (clip.creator as Record<string, unknown>) || {};
    const category = clip.category as Record<string, unknown> | undefined;
    const isMature = !!clip.is_mature;

    return {
      id: clipId,
      formats,
      title: str_or_none(clip.title) ?? undefined,
      channel: str_or_none(channel.slug) ?? undefined,
      channel_id: str_or_none(channel.id) ?? undefined,
      uploader: str_or_none(creator.username) ?? undefined,
      uploader_id: str_or_none(creator.id) ?? undefined,
      thumbnail: url_or_none(clip.thumbnail_url) ?? undefined,
      duration: float_or_none(clip.duration) ?? undefined,
      categories: category?.name ? [String(category.name)] : undefined,
      timestamp: parseIso8601(clip.created_at) ?? undefined,
      view_count: int_or_none(clip.views) ?? undefined,
      like_count: int_or_none(clip.likes) ?? undefined,
      age_limit: isMature ? 18 : 0,
    };
  }
}
