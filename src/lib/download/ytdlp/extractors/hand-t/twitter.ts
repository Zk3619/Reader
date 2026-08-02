/**
 * TwitterBaseIE / TwitterCardIE / TwitterAmplifyIE / TwitterBroadcastIE / TwitterSpacesIE
 * Ported from yt-dlp twitter.py — skips TwitterIE & TwitterShortenerIE (handwritten in twitter.ts)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  filter_dict,
  int_or_none,
  join_nonempty,
  remove_end,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601, strip_or_none, try_call } from './_helpers';

const AUTH =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const LEGACY_AUTH =
  'AAAAAAAAAAAAAAAAAAAAAIK1zgAAAAAA2tUWuhGZ2JceoId5GwYWU5GspY4%3DUq7gzFoCZs1QfwGoVdvSac3IniczZEYXIcDyumCauIXpcAPorE';

export class TwitterBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;
  protected _API_BASE = 'https://api.x.com/1.1/';
  protected _GRAPHQL_API_BASE = 'https://x.com/i/api/graphql/';
  protected _BASE_REGEX =
    'https?:\\/\\/(?:(?:www|m(?:obile)?)\\.)?(?:(?:twitter|x)\\.com|twitter3e4tixl4xyajtrzo62zg5vztmjuricljdp2c5kshju4avyoid\\.onion)\\/';

  get is_logged_in(): boolean {
    return !!this._get_cookies(this._API_BASE).auth_token;
  }

  protected _setBaseHeaders(legacy = false): Record<string, string> {
    const bearer = legacy && !this.is_logged_in ? LEGACY_AUTH : AUTH;
    return filter_dict({
      Authorization: `Bearer ${bearer}`,
      'x-csrf-token': try_call(() => this._get_cookies(this._API_BASE).ct0) || undefined,
    }) as Record<string, string>;
  }

  protected async _fetchGuestToken(displayId: string): Promise<string> {
    const resp = await this._download_json<{ guest_token?: string }>(
      `${this._API_BASE}guest/activate.json`,
      displayId,
      'Downloading guest token',
      { method: 'POST', data: '', headers: this._setBaseHeaders(!displayId) },
    );
    const token = resp?.guest_token;
    if (!token) throw new ExtractorError('Could not retrieve guest token', { expected: true });
    return token;
  }

  protected async _callApi(
    path: string,
    videoId: string,
    query: Record<string, string> = {},
    graphql = false,
  ): Promise<Record<string, unknown>> {
    const headers = this._setBaseHeaders(!graphql);
    if (this.is_logged_in) {
      Object.assign(headers, {
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
      });
    } else {
      headers['x-guest-token'] = await this._fetchGuestToken(videoId);
    }
    const result = await this._download_json<Record<string, unknown>>(
      (graphql ? this._GRAPHQL_API_BASE : this._API_BASE) + path,
      videoId,
      undefined,
      { headers, query, fatal: false },
    );
    const errors = traverse_obj(result, ['errors'], { get_all: true }) as Array<{ message?: string }>;
    const errorMsg = [...new Set((errors || []).map((e) => e?.message).filter(Boolean))].join(', ');
    if (errorMsg && errorMsg.toLowerCase() !== 'dependency: unspecified') {
      if (errorMsg.toLowerCase().includes('not authorized')) {
        this.raise_login_required(remove_end(errorMsg, '.') ?? undefined);
      }
      throw new ExtractorError(`Error(s) while querying API: ${errorMsg}`, { expected: true });
    }
    return result || {};
  }

  protected async _extractVariantFormats(variant: Record<string, unknown>, videoId: string) {
    const variantUrl = variant.url != null ? String(variant.url) : '';
    if (!variantUrl) return { formats: [] as Format[], subtitles: {} as Record<string, Subtitle[]> };
    if (variantUrl.includes('.m3u8')) {
      const res = await extractM3u8FormatsAndSubtitles(this, variantUrl, videoId, 'hls');
      for (const f of res.formats) {
        if (f.vcodec === 'none' && !f.tbr) {
          const m = (f.format_id || '').match(/hls-[Aa]udio-(\d{4,})/);
          if (m) f.tbr = int_or_none(m[1], 1000) ?? undefined;
        }
      }
      return res;
    }
    const tbr = int_or_none(variant.bitrate ?? variant.bit_rate, 1000) ?? undefined;
    const fmt: Format = { url: variantUrl, format_id: join_nonempty('http', tbr != null ? String(tbr) : undefined), tbr };
    const dim = variantUrl.match(/\/(\d+)x(\d+)\//);
    if (dim) {
      fmt.width = int_or_none(dim[1]) ?? undefined;
      fmt.height = int_or_none(dim[2]) ?? undefined;
    }
    return { formats: [fmt], subtitles: {} as Record<string, Subtitle[]> };
  }

  protected async _extractFormatsFromVmapUrl(vmapUrl: string | null | undefined, videoId: string) {
    if (!vmapUrl) return { formats: [] as Format[], subtitles: {} as Record<string, Subtitle[]> };
    const vmapData = await this._download_webpage(vmapUrl, videoId);
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const urls: string[] = [];
    for (const m of vmapData.matchAll(/url="([^"]+)"/g)) {
      const variantUrl = decodeURIComponent(m[1]!.replace(/&amp;/g, '&'));
      urls.push(variantUrl);
      const res = await this._extractVariantFormats({ url: variantUrl }, videoId);
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    const mediaFile = vmapData.match(/<MediaFile[^>]*>([^<]+)<\/MediaFile>/i)?.[1]?.trim();
    if (mediaFile && !urls.includes(mediaFile)) {
      const res = await this._extractVariantFormats({ url: mediaFile }, videoId);
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    return { formats, subtitles };
  }

  protected _buildGraphqlQuery(_mediaId: string): Record<string, unknown> {
    throw new Error('Method must be implemented to support GraphQL');
  }

  protected async _callGraphqlApi(endpoint: string, mediaId: string) {
    const data = this._buildGraphqlQuery(mediaId);
    const query = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)]),
    );
    return traverse_obj(await this._callApi(endpoint, mediaId, query, true), ['data']) as Record<string, unknown>;
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TwitterBaseIE is not a standalone extractor', { expected: true });
  }
}

export class TwitterCardIE extends InfoExtractor {
  static IE_NAME = 'twitter:card';
  static _VALID_URL = new RegExp(
    `${TwitterBaseIE.prototype['_BASE_REGEX']}i/(?:cards/tfw/v1|videos(?:/tweet)?)/(?<id>\\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const statusId = this._match_id(url);
    return this.url_result(`https://twitter.com/statuses/${statusId}`, 'Twitter', statusId);
  }
}

export class TwitterAmplifyIE extends TwitterBaseIE {
  static IE_NAME = 'twitter:amplify';
  static _VALID_URL = /https?:\/\/amp\.twimg\.com\/v\/(?<id>[0-9a-f-]{36})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const vmapUrl = this._html_search_meta('twitter:amplify:vmap', webpage, 'vmap url');
    const { formats } = await this._extractFormatsFromVmapUrl(vmapUrl, videoId);
    const thumbnail = this._html_search_meta('twitter:image:src', webpage, 'thumbnail', false);
    const thumbnails: Thumbnail[] = thumbnail ? [{ url: thumbnail }] : [];
    const videoW = int_or_none(this._html_search_meta('twitter:player:width', webpage, undefined, false));
    const videoH = int_or_none(this._html_search_meta('twitter:player:height', webpage, undefined, false));
    if (formats[0]) {
      formats[0].width = videoW ?? formats[0].width;
      formats[0].height = videoH ?? formats[0].height;
    }
    return { id: videoId, title: 'Twitter Video', formats, thumbnails };
  }
}

async function parseBroadcastM3u8(
  ie: InfoExtractor,
  m3u8Url: string,
  broadcastId: string,
  formatId: string,
  width: number | null,
  height: number | null,
): Promise<Format[]> {
  const fmts = await ie._extract_m3u8_formats(
    m3u8Url,
    broadcastId,
    'mp4',
    'm3u8_native',
    undefined,
    undefined,
    formatId,
    undefined,
    false,
    { headers: { Referer: 'https://www.periscope.tv/' } },
  );
  if (fmts.length === 1) {
    if (width && !fmts[0]!.width) fmts[0]!.width = width;
    if (height && !fmts[0]!.height) fmts[0]!.height = height;
  }
  return fmts;
}

export class TwitterBroadcastIE extends TwitterBaseIE {
  static IE_NAME = 'twitter:broadcast';
  static _VALID_URL = new RegExp(
    `${TwitterBaseIE.prototype['_BASE_REGEX']}i/(?<type>broadcasts|events)/(?<id>\\w+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const broadcastType = m.groups!.type!;
    const displayId = m.groups!.id!;
    let broadcastId = displayId;

    if (broadcastType === 'events') {
      const timeline = await this._callApi(`live_event/1/${displayId}/timeline.json`, displayId);
      const ids = traverse_obj(timeline, ['twitter_objects', 'broadcasts'], { get_all: true }) as unknown[];
      broadcastId = String(
        ids.find((x) => x && typeof x === 'object' && ((x as Record<string, unknown>).id || (x as Record<string, unknown>).broadcast_id)) ||
          displayId,
      );
    }

    const show = await this._callApi('broadcasts/show.json', broadcastId, { ids: broadcastId });
    const broadcast = (show.broadcasts as Record<string, Record<string, unknown>>)?.[broadcastId];
    if (!broadcast) throw new ExtractorError('Broadcast no longer exists', { expected: true });

    const state = String(broadcast.state || '').toLowerCase();
    const liveStatus = state === 'running' ? 'is_live' : state === 'not_started' ? 'is_upcoming' : 'was_live';
    const info: VideoInfo = {
      id: String(broadcast.id || broadcastId),
      display_id: displayId,
      live_status: liveStatus,
      title: clean_html(String(broadcast.status || '')) || undefined,
      uploader_id: broadcast.twitter_username != null ? String(broadcast.twitter_username) : undefined,
      timestamp: parseIso8601(broadcast.created_at) ?? undefined,
      release_timestamp:
        int_or_none(broadcast.scheduled_start_ms, 0.001) ?? int_or_none(broadcast.start_ms, 0.001) ?? undefined,
    };

    if (liveStatus === 'is_upcoming') {
      this.raise_no_formats('This live broadcast has not yet started', true);
      return info;
    }

    const mediaKey = String(broadcast.media_key || '');
    const source = (await this._callApi(`live_video_stream/status/${mediaKey}`, mediaKey)).source as Record<
      string,
      string
    >;
    let m3u8Url = source?.noRedirectPlaybackUrl || source?.location || '';
    if (m3u8Url.includes('/live_video_stream/geoblocked/')) this.raise_geo_restricted();
    const m3u8Id = new URL(m3u8Url).searchParams.get('type') || undefined;
    const width = int_or_none(broadcast.width);
    const height = int_or_none(broadcast.height);
    info.formats = await parseBroadcastM3u8(this, m3u8Url, broadcastId, m3u8Id || 'hls', width, height);
    info.title =
      strip_or_none(broadcast.status) ||
      join_nonempty(info.uploader, 'Twitter Broadcast', ' - ') ||
      info.title;
    return info;
  }
}

export class TwitterSpacesIE extends TwitterBaseIE {
  static IE_NAME = 'twitter:spaces';
  static _VALID_URL = new RegExp(`${TwitterBaseIE.prototype['_BASE_REGEX']}i/spaces/(?<id>[0-9a-zA-Z]{13})`);

  protected _buildGraphqlQuery(spaceId: string) {
    return {
      variables: {
        id: spaceId,
        isMetatagsQuery: true,
        withDownvotePerspective: false,
        withReactionsMetadata: false,
        withReactionsPerspective: false,
        withReplays: true,
        withSuperFollowsUserFields: true,
        withSuperFollowsTweetFields: true,
      },
      features: {
        dont_mention_me_view_api_enabled: true,
        interactive_text_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        responsive_web_enhance_cards_enabled: true,
        responsive_web_uc_gql_enabled: true,
        spaces_2022_h2_clipping: true,
        spaces_2022_h2_spaces_communities: false,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
        vibe_api_enabled: true,
      },
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const spaceId = this._match_id(url);
    const spaceData = (await this._callGraphqlApi('HPEisOmj1epUNLCWTYhUWw/AudioSpaceById', spaceId))
      .audioSpace as Record<string, unknown>;
    if (!spaceData) throw new ExtractorError('Twitter Space not found', { expected: true });

    const metadata = (spaceData.metadata as Record<string, unknown>) || {};
    const statusMap: Record<string, string> = {
      notstarted: 'is_upcoming',
      ended: 'was_live',
      running: 'is_live',
      timedout: 'post_live',
    };
    const liveStatus = statusMap[String(metadata.state || '').toLowerCase()] || undefined;
    const isLive = liveStatus === 'is_live';
    const headers = { Referer: 'https://twitter.com/' };
    let formats: Format[] = [];

    if (liveStatus === 'is_upcoming') {
      this.raise_no_formats('Twitter Space not started yet', true);
    } else if (!isLive && !metadata.is_space_available_for_replay) {
      this.raise_no_formats('Twitter Space ended and replay is disabled', true);
    } else if (metadata.media_key) {
      const status = (await this._callApi(`live_video_stream/status/${metadata.media_key}`, String(metadata.media_key)))
        .source as Record<string, string>;
      const source = status?.noRedirectPlaybackUrl || status?.location;
      if (source) {
        const isAudio = source.includes('audio-space');
        formats = await this._extract_m3u8_formats(
          source,
          String(metadata.media_key),
          isAudio ? 'm4a' : 'mp4',
          isAudio ? 'm3u8' : 'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
          { headers },
        );
        if (isAudio) {
          for (const f of formats) Object.assign(f, { vcodec: 'none', acodec: 'aac', ...(isLive ? {} : { container: 'm4a_dash' }) });
        }
      }
    }

    const speakers = traverse_obj(spaceData, ['participants', 'speakers'], { get_all: true }) as Array<
      Record<string, unknown>
    >;
    const participants = speakers.map((s) => s.display_name).filter(Boolean).join(', ') || 'nobody yet';

    if (!formats.length && liveStatus === 'post_live') {
      this.raise_no_formats('Twitter Space ended but not downloadable yet', true);
    }

    const legacy = (metadata.creator_results as Record<string, Record<string, Record<string, unknown>>> | undefined)
      ?.result?.legacy;

    return {
      id: spaceId,
      description: `Twitter Space participated by ${participants}`,
      formats,
      http_headers: headers,
      live_status: liveStatus,
      title: metadata.title != null ? String(metadata.title) : undefined,
      release_timestamp:
        int_or_none(metadata.started_at, 0.001) ?? int_or_none(metadata.scheduled_start, 0.001) ?? undefined,
      timestamp: int_or_none(metadata.created_at, 0.001) ?? undefined,
      uploader: legacy?.name != null ? String(legacy.name) : undefined,
      uploader_id: legacy?.screen_name != null ? String(legacy.screen_name) : undefined,
      thumbnail:
        url_or_none(String(legacy?.profile_image_url_https || '').replace('_normal', '_400x400')) || undefined,
    };
  }
}
