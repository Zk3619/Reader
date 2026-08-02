/**
 * TwitCastingIE / TwitCastingLiveIE / TwitCastingUserIE — ported from yt-dlp twitcasting.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  parse_duration,
  str_to_int,
  unified_timestamp,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, urljoin, UserNotLive } from './_helpers';

const M3U8_HEADERS = { Origin: 'https://twitcasting.tv', Referer: 'https://twitcasting.tv/' };

export class TwitCastingIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:[^/?#]+\.)?twitcasting\.tv\/(?<uploader_id>[^/?#]+)\/(?:movie|twplayer)\/(?<id>\d+)/;

  protected _parseDataMoviePlaylist(dmp: string, videoId: string): unknown {
    try {
      return this._parse_json(dmp, videoId);
    } catch {
      const decoded = atob([...dmp].reverse().join(''));
      return this._parse_json(decoded, videoId);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const videoId = m.groups!.id!;
    let webpage = await this._download_webpage(url, videoId);

    if (/<form\s+method="POST">\s*<input[^>]+name="password"/i.test(webpage)) {
      throw new ExtractorError('This video is protected by a password, use the --video-password option', {
        expected: true,
      });
    }

    const title =
      clean_html(webpage.match(/id=["']movietitle["'][^>]*>([\s\S]*?)<\//i)?.[1] || '') ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage, undefined, true) ||
      videoId;

    const playlistRaw = this._search_regex(
      /data-movie-playlist='([^']+?)'/,
      webpage,
      'movie playlist',
      null,
      false,
    );
    const videoJsData = playlistRaw
      ? (((this._parseDataMoviePlaylist(playlistRaw, videoId) as Record<string, unknown>)['2'] as unknown[]) || [])
      : [];

    const thumbnail =
      (videoJsData[0] as Record<string, unknown> | undefined)?.thumbnailUrl != null
        ? String((videoJsData[0] as Record<string, unknown>).thumbnailUrl)
        : this._og_search_thumbnail(webpage) || undefined;

    const description =
      clean_html(webpage.match(/id=["']authorcomment["'][^>]*>([\s\S]*?)<\//i)?.[1] || '') ||
      this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage, undefined, false) ||
      undefined;

    const duration =
      (videoJsData as Array<Record<string, unknown>>).reduce(
        (acc, item) => acc + (float_or_none(item.duration) || 0),
        0,
      ) /
        1000 ||
      parse_duration(clean_html(webpage.match(/class=["']tw-player-duration-time["'][^>]*>([\s\S]*?)<\//i)?.[1] || '')) ||
      undefined;

    const viewCount =
      str_to_int(
        this._search_regex(/Total\s*:\s*Views\s*([\d,]+)/, webpage, 'views', null, false) ||
          this._search_regex(/総視聴者\s*:\s*([\d,]+)/, webpage, 'views', null, false),
      ) ?? undefined;

    const timestamp =
      unified_timestamp(
        this._search_regex(/data-toggle="true"[^>]+datetime="([^"]+)"/, webpage, 'datetime', null, false),
      ) ?? undefined;

    const isLive = ['data-is-onlive="true"', 'live-type="live"', 'status="online"'].some((s) => webpage.includes(s));

    const m3u8Url =
      this._search_regex(/data-movie-url=(["'])(?:(?!\1).)+\1/, webpage, 'm3u8 url', null, false)?.replace(
        /^["']|["']$/g,
        '',
      ) ||
      (videoJsData[0] as Record<string, unknown> | undefined)?.url;

    let formats: Format[] = [];
    if (typeof m3u8Url === 'string' && m3u8Url) {
      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      formats = res.formats.map((f) => ({ ...f, http_headers: M3U8_HEADERS }));
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      timestamp,
      uploader_id: uploaderId,
      duration,
      view_count: viewCount,
      is_live: isLive,
      formats,
    };
  }
}

export class TwitCastingLiveIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:[^/?#]+\.)?twitcasting\.tv\/(?<id>[^/?#]+)\/?(?:[#?]|$)/;

  static suitable(url: string): boolean {
    if (/twitcasting\.tv\/[^/]+\/(?:movie|twplayer|show|archive)\//i.test(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const uploaderId = this._match_id(url);
    const status = await this._download_json<{ is_live?: boolean }>(
      `https://frontendapi.twitcasting.tv/watch/user/${uploaderId}`,
      uploaderId,
      'Checking live status',
      { method: 'POST', data: '', fatal: false },
    );
    if (status?.is_live === false) throw new UserNotLive(uploaderId);

    const webpage = await this._download_webpage(`https://twitcasting.tv/${uploaderId}/show/`, uploaderId);
    const currentLive = this._search_regex(
      /<a\s+class="tw-movie-thumbnail2"\s+href="\/[^/"]+\/movie\/(?<vid>\d+)"/,
      webpage,
      'current live ID',
      null,
      false,
      'vid',
    );
    if (!currentLive) throw new UserNotLive(uploaderId);
    return this.url_result(`https://twitcasting.tv/${uploaderId}/movie/${currentLive}`, 'TwitCasting', currentLive);
  }
}

export class TwitCastingUserIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/(?:[^/?#]+\.)?twitcasting\.tv\/(?<id>[^/?#]+)\/(?:show|archive)\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const uploaderId = this._match_id(url);
    const entries: VideoInfo[] = [];
    let nextUrl: string | null = `https://twitcasting.tv/${uploaderId}/show`;
    for (let pageNum = 1; nextUrl; pageNum++) {
      const webpage = await this._download_webpage(nextUrl, uploaderId, undefined, {
        query: { filter: 'watchable' },
      });
      for (const m of webpage.matchAll(/<a\s+class="tw-movie-thumbnail2"\s+href="(?<path>\/[^/"]+\/movie\/\d+)"/g)) {
        entries.push(this.url_result(urljoin('https://twitcasting.tv', m.groups!.path!)));
      }
      const nextMatch = webpage.match(new RegExp(`<a href="(/${uploaderId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/show/${pageNum}-\\d+)[?"]`));
      nextUrl = nextMatch ? urljoin('https://twitcasting.tv', nextMatch[1]!) : null;
    }
    return this.playlist_result(entries, uploaderId, `${uploaderId} - Live History`);
  }
}
