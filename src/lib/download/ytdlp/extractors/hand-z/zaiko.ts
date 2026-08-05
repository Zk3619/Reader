// @ts-nocheck
/** Zaiko*IE ù?ported from yt-dlp zaiko.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, traverse_obj, unescapeHTML, url_or_none } from '../../utils';
import { b64UrlDecode, parseHtmlAttributes, url_basename } from './_helpers';

export class ZaikoBaseIE extends InfoExtractor {
  static IE_NAME = 'zaikobase';
  static _VALID_URL = false as const;

  protected async _download_real_webpage(url: string, videoId: string): Promise<string> {
    const [webpage, urlh] = await this._download_webpage_handle(url, videoId);
    const finalUrl = urlh?.url || '';
    if (finalUrl.includes('zaiko.io/login')) {
      this.raise_login_required();
    } else if (finalUrl.includes('/_buy/')) {
      throw new ExtractorError('Your account does not have tickets to this event', { expected: true });
    }
    return webpage;
  }

  protected _parse_vue_element_attr(name: string, webpage: string, videoId: string): Record<string, any> {
    const elem = this._search_regex(new RegExp(`(<${name}[^>]+>)`), webpage, name);
    const attrs = parseHtmlAttributes(elem);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (!k.startsWith(':')) continue;
      out[k.slice(1)] = this._parse_json(v, videoId, unescapeHTML, false);
    }
    return out;
  }
}

export class ZaikoIE extends ZaikoBaseIE {
  static IE_NAME = 'zaiko';
  static _VALID_URL = /https?:\/\/(?:[\w-]+\.)?zaiko\.io\/event\/(?<id>\d+)\/stream(?:\/\d+)+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_real_webpage(url, videoId);
    const streamMeta = this._parse_vue_element_attr('stream-page', webpage, videoId);

    const playerPage = await this._download_webpage(
      String(traverse_obj(streamMeta, ['stream-access', 'video_source']) || ''),
      videoId,
      'Downloading player page',
      { headers: { referer: 'https://zaiko.io/' } },
    );
    const playerMeta = this._parse_vue_element_attr('player', playerPage, videoId);
    const initialEventInfo = (traverse_obj(playerMeta, ['initial_event_info']) as Record<string, any>) || {};
    const status = String(initialEventInfo.status || '');

    const statusMap: Record<string, [string, string, boolean]> = {
      vod: ['was_live', 'No VOD stream URL was found', false],
      archiving: ['post_live', 'Event VOD is still being processed', true],
      deleting: ['post_live', 'This event has ended', true],
      deleted: ['post_live', 'This event has ended', true],
      error: ['post_live', 'This event has ended', true],
      disconnected: ['post_live', 'Stream has been disconnected', true],
      live_to_disconnected: ['post_live', 'Stream has been disconnected', true],
      live: ['is_live', 'No livestream URL found was found', false],
      waiting: ['is_upcoming', 'Live event has not yet started', true],
      cancelled: ['not_live', 'Event has been cancelled', true],
    };
    const [liveStatus, noFmtMsg, expected] =
      statusMap[status] || ['not_live', `Unknown event status "${status}"`, false];

    let streamUrl: string | null = null;
    if (initialEventInfo.is_jwt_protected) {
      const jwtData = await this._download_json<Record<string, unknown>>(
        String(initialEventInfo.jwt_token_url || ''),
        videoId,
        'Downloading JWT-protected stream URL',
      );
      streamUrl = url_or_none(jwtData.playback_url);
    } else {
      streamUrl = url_or_none(initialEventInfo.endpoint);
    }

    const formats: Format[] = streamUrl
      ? await this._extract_m3u8_formats(
          streamUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          undefined,
          undefined,
          false,
        )
      : [];
    if (!formats.length) this.raise_no_formats(noFmtMsg, expected);

    const eventPage = await this._download_webpage(
      `https://zaiko.io/event/${videoId}`,
      videoId,
      'Downloading event page',
      { fatal: false },
    );
    const thumbA = url_or_none(initialEventInfo.poster_url);
    const thumbB = eventPage ? this._og_search_thumbnail(eventPage, undefined, false) : null;
    const thumbnails = [thumbA, thumbB].filter(Boolean).map((u) => ({
      url: u as string,
      id: url_basename(u as string) || undefined,
    }));

    return {
      id: videoId,
      formats,
      live_status: liveStatus,
      title: String(traverse_obj(streamMeta, ['event', 'name']) || videoId),
      uploader: (traverse_obj(streamMeta, ['profile', 'name']) as string) || undefined,
      uploader_id: String(traverse_obj(streamMeta, ['profile', 'id']) || '') || undefined,
      release_timestamp: int_or_none(traverse_obj(streamMeta, ['stream', 'start', 'timestamp'])) ?? undefined,
      categories: (traverse_obj(streamMeta, ['event', 'genres']) as string[]) || undefined,
      alt_title: String(initialEventInfo.title || '') || undefined,
      thumbnails,
    };
  }
}

export class ZaikoETicketIE extends ZaikoBaseIE {
  static IE_NAME = 'zaiko:eticket';
  static _VALID_URL = /https?:\/\/(?:www\.)?zaiko\.io\/account\/eticket\/(?<id>[\w=-]{49})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let ticketId = this._match_id(url);
    const decoded = b64UrlDecode(ticketId.slice(1));
    if (decoded) ticketId = decoded.replace(/\|/g, '-');

    const webpage = await this._download_real_webpage(url, ticketId);
    const eticket = this._parse_vue_element_attr('eticket', webpage, ticketId);
    const streams = (traverse_obj(eticket, ['streams']) as Array<Record<string, unknown>>) || [];
    const entries = streams
      .map((s) => this.url_result(String(s.url || ''), 'Zaiko'))
      .filter((e) => Boolean((e as Record<string, unknown>).url));

    return {
      ...this.playlist_result(
        entries,
        ticketId,
        (traverse_obj(eticket, ['ticket-details', 'event_name']) as string) || undefined,
      ),
      thumbnail: (traverse_obj(eticket, ['ticket-details', 'event_img_url']) as string) || undefined,
    };
  }
}
