/** Rokfin* — ported from yt-dlp rokfin.py (main paths) */

import { ExtractorError, InfoExtractor, SearchInfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, float_or_none, int_or_none, str_or_none, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, format_field } from './_helpers';

const API_BASE = 'https://prod-api-v2.production.rokfin.com/api/v2/public/';

export class RokfinIE extends InfoExtractor {
  static IE_NAME = 'rokfin';
  static _VALID_URL = /https?:\/\/(?:www\.)?rokfin\.com\/(?<id>(?<type>post|stream)\/\d+)/;
  static _NETRC_MACHINE = 'rokfin';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const videoType = m.groups!.type!;
    const metadata = await this._download_json<Record<string, unknown>>(`${API_BASE}${videoId}`, videoId);

    const scheduled = unified_timestamp(metadata.scheduledAt as string);
    const liveStatus = metadata.stoppedAt
      ? 'was_live'
      : scheduled
        ? 'is_upcoming'
        : videoType === 'stream'
          ? 'is_live'
          : 'not_live';

    let videoUrl = url_or_none(metadata.url as string) || url_or_none((metadata.content as Record<string, unknown>)?.contentUrl as string);
    if (!videoUrl || videoUrl === 'fake.m3u8') {
      const timelineUrl = (metadata.timelineUrl as string) || ((metadata.content as Record<string, unknown>)?.timelineUrl as string);
      const slug = this._search_regex(/https?:\/\/[^/]+\/([^/]+)\/storyboard\.vtt/, timelineUrl || '', 'slug', null, false);
      videoUrl = format_field({ slug }, 'slug', 'https://stream.v.rokfin.com/%s.m3u8');
    }

    let formats: Format[] = videoUrl ? [{ url: videoUrl, format_id: determine_ext(videoUrl) || 'http' }] : [];
    let subtitles = {};
    if (videoUrl && determine_ext(videoUrl) === 'm3u8') {
      const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls');
      formats = res.formats;
      subtitles = res.subtitles;
    }
    if (!formats.length) {
      if (metadata.premiumPlan || metadata.premium) {
        this.raise_login_required('This video is only available to premium users', true, 'cookies');
      }
      if (scheduled) {
        throw new ExtractorError(`Stream is offline; scheduled for ${new Date(scheduled * 1000).toISOString()}`, {
          expected: true,
        });
      }
    }

    const createdBy = metadata.createdBy as Record<string, unknown> | undefined;
    const creator = metadata.creator as Record<string, unknown> | undefined;
    const uploader = str_or_none(createdBy?.username || creator?.username);
    const timestamp =
      scheduled ||
      float_or_none(metadata.postedAtMilli as number, 1000) ||
      unified_timestamp(metadata.creationDateTime as string) ||
      undefined;

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(metadata.title as string || (metadata.content as Record<string, unknown>)?.contentTitle as string) ?? undefined,
      duration: float_or_none((metadata.content as Record<string, unknown>)?.duration as number) ?? undefined,
      thumbnail: url_or_none(metadata.thumbnail as string || (metadata.content as Record<string, unknown>)?.thumbnailUrl1 as string) ?? undefined,
      description:
        str_or_none(metadata.description as string || (metadata.content as Record<string, unknown>)?.contentDescription as string) ?? undefined,
      like_count: int_or_none(metadata.likeCount as number) ?? undefined,
      dislike_count: int_or_none(metadata.dislikeCount as number) ?? undefined,
      channel: str_or_none(createdBy?.name || creator?.name) ?? undefined,
      channel_id: str_or_none(createdBy?.id || creator?.id) ?? undefined,
      channel_url: uploader ? `https://rokfin.com/${uploader}` : undefined,
      timestamp,
      release_timestamp: liveStatus !== 'not_live' ? timestamp : undefined,
      live_status: liveStatus,
    };
  }
}

export class RokfinPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'RokfinPlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RokfinPlaylistBaseIE is not a standalone extractor', { expected: true });
  }
}

export class RokfinStackIE extends RokfinPlaylistBaseIE {
  static IE_NAME = 'rokfin:stack';
  static IE_DESC = 'Rokfin Stacks';
  static _VALID_URL = /https?:\/\/(?:www\.)?rokfin\.com\/stack\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const stackId = this._match_id(url);
    const data = await this._download_json<{ content?: Array<{ url?: string }> }>(`${API_BASE}stack/${stackId}`, stackId);
    const entries = (data.content || []).map((item) => this.url_result(String(item.url || ''), 'Rokfin'));
    return this.playlist_result(entries, stackId);
  }
}

export class RokfinChannelIE extends RokfinPlaylistBaseIE {
  static IE_NAME = 'rokfin:channel';
  static IE_DESC = 'Rokfin Channels';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rokfin\.com\/(?!((feed\/?)|(discover\/?)|(channels\/?))$)(?<id>[^/]+)\/?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const data = await this._download_json<{ content?: Array<{ url?: string }> }>(`${API_BASE}channel/${channelId}`, channelId);
    const entries = (data.content || []).map((item) => this.url_result(String(item.url || ''), 'Rokfin'));
    return this.playlist_result(entries, channelId);
  }
}

export class RokfinSearchIE extends SearchInfoExtractor {
  static IE_NAME = 'rokfin:search';
  static IE_DESC = 'Rokfin Search';
  static _VALID_URL: RegExp | string | false | null = false;
  static _SEARCH_KEY = 'rkfnsearch';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('Use search syntax instead', { expected: true });
  }

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const data = await this._download_json<{ content?: Array<{ url?: string }> }>(
      `${API_BASE}search`,
      query,
      undefined,
      { query: { q: query, size: String(n) } },
    );
    return (data.content || []).slice(0, n).map((item) => this.url_result(String(item.url || ''), 'Rokfin'));
  }
}
