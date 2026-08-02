/** OpenRec / mellow-fan family — ported from yt-dlp openrec.py (chat subs & login edges simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  join_nonempty,
  parse_qs,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';
import { parseIso8601, playlistFromMatches, urljoin } from './_helpers';

const API_BASE = 'https://apiv5.mellow-fan.com/api/v5';
const BASE_URL = 'https://www.mellow-fan.com';
const HEADERS = { Referer: `${BASE_URL}/` };
const PUBLIC_API_BASE = 'https://public.mellow-fan.com/external/api/v5';

export class OpenRecBaseIE extends InfoExtractor {
  static IE_NAME = 'openrecbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _NETRC_MACHINE = 'mellowfan';

  protected _apiHeaders: Record<string, string> = {};

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('OpenRecBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _realInitialize(): Promise<void> {
    const cookies = await this._get_cookies(BASE_URL);
    this._apiHeaders = {
      'access-token': cookies.access_token || '',
      random: cookies.random || '',
      token: cookies.token || '',
      uuid: cookies.uuid || '',
    };
  }

  protected _extractPagestore(webpage: string, videoId: string): Record<string, unknown> {
    const encoded = this._search_regex(
      /window\.pageStore\s*=\s*JSON\.parse\s*\(\s*decodeURIComponent\s*\(\s*(["'])([\s\S]*?)\1\s*\)\s*\)/,
      webpage,
      'encoded window pagestore',
      null,
      true,
      2,
    );
    if (encoded) {
      return this._parse_json(decodeURIComponent(encoded), videoId)!;
    }
    return this._search_json<Record<string, unknown>>(/window\.pageStore\s*=/, webpage, 'window pagestore', videoId)!;
  }

  protected async _callApi(path: string, itemId: string): Promise<Record<string, unknown>> {
    await this._realInitialize();
    return this._download_json<Record<string, unknown>>(`${API_BASE}/${path}`, itemId, undefined, {
      headers: this._apiHeaders,
      fatal: false,
    });
  }

  protected async _parseOpenrecMetadata(
    pageStore: Record<string, unknown>,
    videoId: string,
  ): Promise<[Record<string, unknown>, Record<string, unknown>, VideoInfo]> {
    const info = ((pageStore.v8 as Record<string, unknown>)?.movie as Record<string, unknown>) || {};
    const targetMembersArr = (info.targetMembers as Array<Record<string, unknown>>) || [];
    const targetMembers = String(targetMembersArr.map((t) => t.type).find(Boolean) ?? '');
    const needsSubscription = targetMembers === 'subscription';
    const needsAuth = targetMembers === 'ppv';
    const needsPremium = String(info.publicType ?? '') === 'premium';

    const me = await this._callApi('users/me', videoId);
    const meItems = ((me.data as Record<string, unknown>)?.items as Array<Record<string, unknown>>) || [];
    const isPremium = meItems.some((i) => i.is_premium);
    const detail = await this._callApi(`movies/${videoId}/detail`, videoId);
    const detailItems = ((detail.data as Record<string, unknown>)?.items as Array<Record<string, unknown>>) || [];
    const isMember = detailItems.some((i) => (i.membership as Record<string, unknown> | undefined)?.is_active);
    const hasPpv = detailItems.some((i) => i.ppv_ticket_products);

    let need: string | null = null;
    if (needsPremium && !isPremium) need = 'premium membership';
    else if (needsSubscription && !isMember) need = 'channel subscription';
    else if (needsAuth && !hasPpv) need = 'PPV purchase';
    if (need) this.raise_login_required(`This content requires a ${need}`, true);

    const channel = ((info.channel as Record<string, unknown>)?.user as Record<string, unknown>) || {};
    const metadata: VideoInfo = {
      id: videoId,
      availability: needsPremium
        ? 'premium_only'
        : needsSubscription
          ? 'subscriber_only'
          : needsAuth
            ? 'needs_auth'
            : 'public',
      http_headers: HEADERS,
      tags: ((pageStore.movieStore as Record<string, unknown>)?.tags as string[] | undefined)?.map((t) =>
        clean_html(t),
      ).filter(Boolean) as string[],
      title: clean_html(String(info.title ?? '')) || undefined,
      cast: ((info.casts as Array<Record<string, unknown>>) || [])
        .map((c) => clean_html(String(c.name ?? '')))
        .filter(Boolean) as string[],
      categories: [clean_html(String(((info.game as Record<string, unknown>)?.title) ?? ''))].filter(Boolean) as string[],
      description: clean_html(String(info.introduction ?? '')) || undefined,
      duration: int_or_none(traverse_obj(info, ["playTime", "value"]), 1000) ?? undefined,
      thumbnail:
        url_or_none(info.lThumbnailUrl) || url_or_none(info.thumbnailUrl) || undefined,
      timestamp: int_or_none(traverse_obj(info, ["startedAt", "time"]), 1000) ?? undefined,
      view_count: int_or_none(info.totalViews) ?? undefined,
      channel_follower_count: int_or_none(channel.followers) ?? undefined,
      channel_id: str_or_none(channel.id) ?? undefined,
      channel: clean_html(String(channel.name ?? '')) || undefined,
      channel_is_verified: channel.isOfficial as boolean | undefined,
    };

    return [info, detail, metadata];
  }
}

export class OpenRecIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?live\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId, undefined, { fatal: false });
    const pageStore = this._extractPagestore(webpage, videoId);
    if ((pageStore.movieStore as Record<string, unknown>)?.notFound) {
      throw new ExtractorError('This video in no longer available', { expected: true });
    }

    const [info, detail, metadata] = await this._parseOpenrecMetadata(pageStore, videoId);
    const liveStatusMap: Record<string, VideoInfo['live_status']> = {
      ARCHIVE: 'was_live',
      COMING_UP: 'is_upcoming',
      LIVE_STREAMING: 'is_live',
      UPLOADED: 'not_live',
    };
    const liveStatus = liveStatusMap[String(info.onAirStatus ?? '')];
    const releaseTimestamp = parseIso8601(
      (pageStore.movieStore as Record<string, unknown>)?.willStartAt,
    );

    if (liveStatus === 'is_upcoming') {
      this.raise_no_formats(
        releaseTimestamp != null
          ? `This livestream is scheduled to start at ${new Date(releaseTimestamp * 1000).toLocaleString()}`
          : 'This livestream has not yet started',
        true,
      );
      return { id: videoId, live_status: liveStatus, release_timestamp: releaseTimestamp ?? undefined };
    }

    const startedAt = metadata.timestamp ?? 0;
    const chapters = ((info.chapters as Array<Record<string, unknown>>) || [])
      .filter((c) => int_or_none(traverse_obj(c, ["chapterAt", "time"])) != null)
      .map((chapter) => ({
        start_time:
          (int_or_none(traverse_obj(chapter, ["chapterAt", "time"]), 1000) ?? 0) - startedAt,
        title: clean_html(String(chapter.title ?? '')) || undefined,
      }));

    const isDvr = liveStatus === 'is_live' && Boolean((this.params as Record<string, unknown>).live_from_start);
    const mediaKeys = isDvr ? ['url_dvr', 'url_dvr_audio'] : ['url', 'url_audio'];
    const formats: NonNullable<VideoInfo['formats']> = [];
    for (const item of (traverse_obj(detail, ["data", "items"]) as Array<Record<string, unknown>>) || []) {
      for (const key of mediaKeys) {
        const media = (item.media as Record<string, unknown>) || {};
        const trial = (item.subs_trial_media as Record<string, unknown>) || {};
        const m3u8Url = url_or_none(media[key]) || url_or_none(trial[key]);
        if (!m3u8Url) continue;
        const fmts = await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          true,
          { headers: HEADERS },
        );
        for (const fmt of fmts) {
          if (isDvr) {
            fmt.downloader_options = { ...(fmt.downloader_options || {}), ffmpeg_args: ['-live_start_index', '0'] };
            fmt.is_from_start = true;
          }
        }
        formats.push(...fmts);
      }
    }

    return {
      ...metadata,
      chapters: chapters.length ? chapters : undefined,
      comment_count: int_or_none((pageStore.commentStore as Record<string, unknown>)?.commentCount) ?? undefined,
      formats,
      live_status: liveStatus,
      release_timestamp: releaseTimestamp ?? undefined,
    };
  }
}

export class OpenRecCaptureIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan:capture';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?capture\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageStore = this._extractPagestore(webpage, videoId);
    const capture = (pageStore.capture as Record<string, unknown>) || {};
    const channel = ((pageStore.movie as Record<string, unknown>)?.channel as Record<string, unknown>) || {};

    return {
      id: videoId,
      formats: await this._extract_m3u8_formats(
        url_or_none(capture.source) || '',
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        true,
        { headers: HEADERS },
      ),
      http_headers: HEADERS,
      channel: clean_html(String(channel.name ?? '')) || undefined,
      channel_id: str_or_none(channel.id) ?? undefined,
      title: clean_html(String(capture.title ?? '')) || undefined,
      duration:
        int_or_none(capture.endTime) != null && int_or_none(capture.startTime) != null
          ? int_or_none(capture.endTime)! - int_or_none(capture.startTime)!
          : undefined,
      thumbnail: url_or_none(capture.thumbnailUrl) ?? undefined,
      timestamp: parseIso8601(capture.publishedAt) ?? undefined,
    };
  }
}

export class OpenRecMovieIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan:movie';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?movie\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageStore = this._extractPagestore(webpage, videoId);
    const [, detail, metadata] = await this._parseOpenrecMetadata(pageStore, videoId);

    const formats: NonNullable<VideoInfo['formats']> = [];
    for (const item of (traverse_obj(detail, ["data", "items"]) as Array<Record<string, unknown>>) || []) {
      for (const key of ['url', 'url_audio'] as const) {
        const media = (item.media as Record<string, unknown>) || {};
        const m3u8Url = url_or_none(media[key]);
        if (m3u8Url) {
          formats.push(
            ...(await this._extract_m3u8_formats(
              m3u8Url,
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              true,
              { headers: HEADERS },
            )),
          );
        }
      }
    }

    return { ...metadata, formats };
  }
}

export class OpenRecPlaylistIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?user\/[^/?#]+\/playlist\/(?<id>[^/?#]+)/;

  protected *_entries(items: Record<string, unknown>): Generator<VideoInfo> {
    for (const movie of (items.playlist_movies as Array<Record<string, unknown>>) || []) {
      const movieObj = (movie.movie as Record<string, unknown>) || {};
      const movieId = str_or_none(movieObj.id);
      if (!movieId) continue;
      const isLive = Boolean((movieObj.movie as Record<string, unknown> | undefined)?.is_live);
      const path = isLive ? 'live' : 'movie';
      const ie = isLive ? 'OpenRec' : 'OpenRecMovie';
      yield this.url_result(`${BASE_URL}/${path}/${movieId}`, ie);
    }
    for (const capture of (items.playlist_captures as Array<Record<string, unknown>>) || []) {
      const captureId = str_or_none(
        ((capture.capture_relation as Record<string, unknown>)?.capture as Record<string, unknown>)?.id,
      );
      if (captureId) yield this.url_result(`${BASE_URL}/capture/${captureId}`, 'OpenRecCapture');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const me = await this._callApi(`users/me/playlists/${playlistId}`, playlistId);
    const items = (traverse_obj(me, ["data", "items"]) as Array<Record<string, unknown>> | undefined)?.[0];
    if (items) {
      return this.playlist_result([...this._entries(items)], playlistId, clean_html(String(items.title ?? '')) || undefined);
    }

    const webpage = await this._download_webpage(url, playlistId);
    const hrefs = [...webpage.matchAll(/class="sc-1ddd11y-0"[^>]*href="([^"]+)"/g)].map((m) =>
      urljoin(`${BASE_URL}/`, m[1]!),
    );
    const titleMatch = webpage.match(/class="sc-1ak77bz-10"[^>]*>([\s\S]*?)<\//);
    return playlistFromMatches(this, hrefs, playlistId, {
      title: clean_html(titleMatch?.[1] ?? '') || undefined,
    });
  }
}

export class OpenRecChannelIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan:channel';
  static _PAGE_SIZE = 40;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?user\/(?<id>[^/?#]+)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const webpage = await this._download_webpage(url, channelId);
    const pageStore = this._extractPagestore(webpage, channelId);
    const channel = ((pageStore.state as Record<string, unknown>)?._channel as Record<string, unknown>) || {};
    const movieCount = int_or_none(channel.movieCount) ?? 0;
    const pageCount = Math.ceil(movieCount / OpenRecChannelIE._PAGE_SIZE);

    const entries: VideoInfo[] = [];
    for (let page = 1; page <= pageCount; page++) {
      const searchMovies = await this._download_json<Array<Record<string, unknown>>>(
        `${PUBLIC_API_BASE}/search-movies`,
        channelId,
        `Downloading page ${page}`,
        {
          query: {
            channel_ids: channelId,
            include_live: 'true',
            include_upload: 'true',
            onair_status: '2',
            include_deleted: 'true',
            sort: 'published_at',
            page: String(page),
          },
        },
      );
      for (const movie of searchMovies || []) {
        const movieType = str_or_none(movie.movie_type);
        const movieId = str_or_none(movie.id);
        if (!movieType || !movieId) continue;
        const path = movieType === '1' ? 'live' : 'movie';
        const ie = movieType === '1' ? 'OpenRec' : 'OpenRecMovie';
        entries.push(this.url_result(`${BASE_URL}/${path}/${movieId}`, ie));
      }
    }

    const user = (channel.user as Record<string, unknown>) || {};
    return this.playlist_result(
      entries,
      channelId,
      clean_html(String(user.name ?? '')) || undefined,
    );
  }
}

export class OpenRecChannelSearchIE extends OpenRecBaseIE {
  static IE_NAME = 'mellowfan:channel:search';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mellow-fan\.com|openrec\.tv)\/(?:m\/)?user\/(?<id>[^/?#]+)\/search(?:\/(?<type>capture|movie))?(?:[/?#]|$)/;

  protected async *_entries(
    channelId: string,
    searchType: string,
    searchQuery: string,
  ): AsyncGenerator<VideoInfo> {
    const apiUrl = `${PUBLIC_API_BASE}/search-${searchType}s`;
    const typeMap: Record<string, string> = {
      capture: 'OpenRecCapture',
      live: 'OpenRec',
      movie: 'OpenRecMovie',
    };

    for (let page = 1; ; page++) {
      const searchItems = await this._download_json<Array<Record<string, unknown>>>(
        apiUrl,
        channelId,
        `Downloading page ${page}`,
        { query: { channel_ids: channelId, page: String(page), search_query: searchQuery } },
      );
      if (!searchItems?.length) break;
      for (const item of searchItems) {
        const itemType = searchType === 'movie' && item.is_live ? 'live' : searchType;
        const itemId =
          str_or_none(item.id) ||
          str_or_none((item.capture as Record<string, unknown> | undefined)?.id);
        if (itemId) yield this.url_result(`${BASE_URL}/${itemType}/${itemId}`, typeMap[itemType]!);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channelId = m.groups!.id!;
    const searchType = m.groups!.type;
    const searchQuery = parse_qs(url).search_query?.slice(-1)[0];
    if (!searchQuery) throw new ExtractorError('Unable to extract search query', { expected: true });

    if (!searchType) {
      const entries = ['capture', 'movie'].map((type) =>
        this.url_result(
          update_url_query(`${BASE_URL}/user/${channelId}/search/${type}`, { search_query: searchQuery }),
          'OpenRecChannelSearch',
        ),
      );
      return this.playlist_result(entries, channelId, join_nonempty(channelId, searchQuery, ':'));
    }

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(channelId, searchType, searchQuery)) entries.push(entry);
    return this.playlist_result(
      entries,
      channelId,
      join_nonempty(channelId, searchQuery, searchType, ':'),
    );
  }
}
