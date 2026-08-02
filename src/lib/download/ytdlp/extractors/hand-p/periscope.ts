/** PeriscopeBaseIE / PeriscopeIE / PeriscopeUserIE — ported from yt-dlp periscope.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, unescapeHTML } from '../../utils';
import { parseIso8601 } from './_helpers';

const M3U8_HEADERS = { Referer: 'https://www.periscope.tv/' };

export class PeriscopeBaseIE extends InfoExtractor {
  static IE_NAME = 'periscopebase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('PeriscopeBaseIE is not a standalone extractor');
  }

  protected async _callApi(method: string, query: Record<string, string>, itemId: string): Promise<Record<string, unknown>> {
    return this._download_json(`https://api.periscope.tv/api/v2/${method}`, itemId, undefined, { query });
  }

  protected _parseBroadcastData(broadcast: Record<string, unknown>, videoId: string): Partial<VideoInfo> {
    const state = str_or_none(broadcast.state)?.toLowerCase();
    const liveStatus =
      state === 'running' ? 'is_live' : state === 'not_started' ? 'is_upcoming' : 'was_live';
    return {
      display_id: videoId,
      live_status: liveStatus,
      id: str_or_none(broadcast.id) ?? undefined,
      title: clean_html(str_or_none(broadcast.status)) ?? undefined,
      concurrent_view_count: int_or_none(broadcast.total_watching) ?? undefined,
      release_timestamp:
        int_or_none(broadcast.scheduled_start_ms, 0.001) ?? int_or_none(broadcast.start_ms, 0.001) ?? undefined,
      timestamp:
        parseIso8601(broadcast.created_at) ?? int_or_none(broadcast.created_at_ms, 0.001) ?? undefined,
      uploader: clean_html(str_or_none(broadcast.user_display_name)) ?? undefined,
      uploader_id: clean_html(str_or_none(broadcast.username)) ?? undefined,
      view_count: int_or_none(broadcast.total_watched) ?? undefined,
    };
  }

  protected async _extractPscpM3u8(
    m3u8Url: string,
    videoId: string,
    formatId: string,
    state: string | undefined,
    width: number | null,
    height: number | null,
  ): Promise<Format[]> {
    const protocol = state === 'ended' || state === 'timed_out' ? 'm3u8_native' : 'm3u8';
    const fmts = await this._extract_m3u8_formats(
      m3u8Url,
      videoId,
      'mp4',
      protocol,
      undefined,
      undefined,
      formatId,
      undefined,
      false,
      { headers: M3U8_HEADERS },
    );
    if (fmts.length === 1) {
      if (width && !fmts[0]!.width) fmts[0]!.width = width;
      if (height && !fmts[0]!.height) fmts[0]!.height = height;
    }
    for (const f of fmts) f.http_headers = { ...M3U8_HEADERS, ...(f.http_headers || {}) };
    return fmts;
  }
}

export class PeriscopeIE extends PeriscopeBaseIE {
  static IE_NAME = 'periscope';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:periscope|pscp)\.tv\/[^/?#]+\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const token = this._match_id(url);
    const stream = await this._callApi('accessVideoPublic', { broadcast_id: token }, token);
    const broadcast = (stream.broadcast as Record<string, unknown>) || {};
    const info = this._parseBroadcastData(broadcast, token);
    const state = str_or_none(broadcast.state)?.toLowerCase();
    const width = int_or_none(broadcast.width);
    const height = int_or_none(broadcast.height);

    const videoUrls = new Set<string>();
    const formats: Format[] = [];
    for (const formatId of ['replay', 'rtmp', 'hls', 'https_hls', 'lhls', 'lhlsweb'] as const) {
      const videoUrl = str_or_none(stream[`${formatId}_url`]);
      if (!videoUrl || videoUrls.has(videoUrl)) continue;
      videoUrls.add(videoUrl);
      if (formatId === 'rtmp') {
        formats.push({ url: videoUrl, format_id: formatId, ext: 'flv', width: width ?? undefined, height: height ?? undefined });
      } else {
        formats.push(...(await this._extractPscpM3u8(videoUrl, token, formatId, state, width, height)));
      }
    }

    return { ...info, id: info.id || token, formats };
  }
}

export class PeriscopeUserIE extends PeriscopeBaseIE {
  static IE_NAME = 'periscope:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:periscope|pscp)\.tv\/(?<id>[^/]+)\/?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userName = this._match_id(url);
    const webpage = await this._download_webpage(url, userName);
    const dataStore = this._parse_json(
      unescapeHTML(
        this._search_regex(/data-store=(["'])(?<data>.+?)\1/, webpage, 'data store', '{}', false, 'data') || '{}',
      ),
      userName,
    ) as Record<string, unknown>;
    const users = ((dataStore.UserCache as Record<string, unknown>)?.users as Record<string, { user?: Record<string, unknown> }>) || {};
    const user = Object.values(users)[0]?.user || {};
    const userId = String(user.id ?? userName);
    const sessionId = ((dataStore.SessionToken as Record<string, unknown>)?.public as Record<string, unknown>)?.broadcastHistory as Record<string, unknown>;
    const token = ((sessionId?.token as Record<string, unknown>)?.session_id as string) || '';

    const broadcasts = (
      await this._callApi('getUserBroadcastsPublic', { user_id: userId, session_id: token }, userName)
    ).broadcasts as Array<Record<string, unknown>>;
    const entries = (broadcasts || [])
      .map((b) => str_or_none(b.id))
      .filter(Boolean)
      .map((broadcastId) => this.url_result(`https://www.periscope.tv/${userName}/${broadcastId}`, 'periscope', broadcastId!));

    return this.playlist_result(
      entries,
      userId,
      str_or_none(user.display_name) || str_or_none(user.username) || userName,
      str_or_none(user.description) ?? undefined,
    );
  }
}
