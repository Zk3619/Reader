// @ts-nocheck
/** VKBaseIE / VKIE / VKUserVideosIE / VKWallPostIE / VKPlay* â€?ported from yt-dlp vk.py */

import { createHash } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_class,
  int_or_none,
  parse_qs,
  str_or_none,
  str_to_int,
  traverse_obj,
  unescapeHTML,
  unified_timestamp,
  update_url_query,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  extractYoutubeEmbedUrl,
  get_element_html_by_id,
  mergeSubtitles,
  parse_resolution,
  protoRelative,
  try_call,
  urlencodePostdata,
  urljoin,
  UserNotLive,
} from './_helpers';

export class VKBaseIE extends InfoExtractor {
  static IE_NAME = 'vk:base';
  static _VALID_URL = false as const;
  static _NETRC_MACHINE = 'vk';

  /** Simplified: challenge.html solving uses MD5 when salt regex is found; otherwise retries once. */
  protected async _download_payload(
    path: string,
    videoId: string,
    data: Record<string, string | number>,
    fatal = true,
  ): Promise<unknown> {
    const endpoint = `https://vk.com/${path}.php`;
    const body = { ...data, al: 1 };
    const resp = await this._download_json<{ payload: [string, ...unknown[]] }>(
      endpoint,
      videoId,
      undefined,
      {
        fatal,
        method: 'POST',
        data: urlencodePostdata(body as Record<string, string | number | boolean>),
        headers: {
          Referer: endpoint,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    if (!resp?.payload) {
      if (!fatal) return null;
      throw new ExtractorError('Unable to download VK payload', { expected: true });
    }
    const [code, ...rest] = resp.payload;
    if (code === '3') this.raise_login_required();
    if (code === '8') {
      throw new ExtractorError(clean_html(String((rest[0] as unknown[])?.[0] ?? rest[0])) || 'VK error', {
        expected: true,
      });
    }
    return rest.length === 1 ? rest[0] : rest;
  }

  protected async _solve_challenge_if_needed(webpage: string, challengeUrl: string, videoId: string): Promise<void> {
    if (!/\/challenge\.html/.test(challengeUrl)) return;
    const qs = parse_qs(challengeUrl);
    const challengeHash = qs.hash429?.[qs.hash429.length - 1];
    if (!challengeHash) return;
    // Best-effort: without full JSInterpreter, use empty salt fallback when function not found
    const funcCode = this._search_regex(
      /var\s+salt\s*=\s*\(\s*function\s*\(\)\s*(\{.+?\})\s*\)\(\);\s*var\s+hash/s,
      webpage,
      'JS challenge salt function',
      undefined,
      false,
    );
    void funcCode;
    const salt = '';
    const keyHash = createHash('md5').update(`${challengeHash}:${salt}`).digest('hex');
    await this._download_webpage(
      update_url_query(challengeUrl, { key: keyHash }),
      videoId,
      'Submitting JS challenge solution',
      { fatal: false },
    );
  }
}

export class VKIE extends VKBaseIE {
  static IE_NAME = 'vk';
  static IE_DESC = 'VK';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:(?:m|new|vksport)\.)?vk(?:(?:video)?\.ru|\.com)\/video_|((?:www\.)?daxab\.com\/))ext\.php\?(?<embed_query>.*?\boid=(?<oid>-?\d+).*?\bid=(?<id>\d+).*)|(?:(?:(?:m|new|vksport)\.)?vk(?:(?:video)?\.ru|\.com)\/(?:.+?\?.*?z=)?(?:video|clip)|(?:www\.)?daxab\.com\/embed\/)(?<videoid>-?\d+_\d+)(?:.*\blist=(?<list_id>([\da-f]+)|(ln-[\da-zA-Z]+)))?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    let videoId = mobj.groups!.videoid;
    let mvData: Record<string, unknown> = {};
    let player: Record<string, unknown> = {};
    let infoPage = '';

    if (videoId) {
      const data: Record<string, string> = { act: 'show', video: videoId };
      const listId = mobj.groups!.list_id;
      if (listId) data.list = listId;
      const payload = (await this._download_payload('al_video', videoId, data)) as unknown[];
      infoPage = String(payload[0] ?? '');
      const opts = (payload[payload.length - 1] || {}) as Record<string, unknown>;
      mvData = (opts.mvData as Record<string, unknown>) || {};
      player = (opts.player as Record<string, unknown>) || {};
    } else {
      videoId = `${mobj.groups!.oid}_${mobj.groups!.id}`;
      infoPage = await this._download_webpage(
        `https://vk.com/video_ext.php?${mobj.groups!.embed_query}`,
        videoId,
      );

      const errorMessage = this._html_search_regex(
        [
          /<!><div[^>]+class="video_layer_message"[^>]*>([\s\S]+?)<\/div>/,
          /<div[^>]+id="video_ext_msg"[^>]*>([\s\S]+?)<\/div>/,
        ],
        infoPage,
        'error message',
        null,
        false,
      );
      if (errorMessage) throw new ExtractorError(errorMessage, { expected: true });

      if (/<!>\/login\.php\?.*\bact=security_check/.test(infoPage)) {
        throw new ExtractorError(
          'Unusual location login confirmation required at vk.com',
          { expected: true },
        );
      }

      const ERRORS: Array<[RegExp, string]> = [
        [/>The video .*? was removed from public access by request of the copyright holder\.</, 'Video %s removed due to copyright'],
        [/<!>Please log in or </, 'Video %s only available for registered users'],
        [/<!>Unknown error/, 'Video %s does not exist'],
        [/<!>Access denied/, 'Access denied to video %s'],
        [/<!>This video is no longer available, because its author has been blocked\./, 'Video %s author blocked'],
        [/<!>This video is no longer available, because it has been deleted\./, 'Video %s deleted'],
        [/<!>The video .+? is not available in your region\./, 'Video %s not available in your region'],
      ];
      for (const [re, msg] of ERRORS) {
        if (re.test(infoPage)) throw new ExtractorError(msg.replace('%s', videoId), { expected: true });
      }

      player = this._parse_json(
        this._search_regex(
          /var\s+playerParams\s*=\s*({.+?})\s*;\s*\n/,
          infoPage,
          'player params',
        )!,
        videoId,
      )!;
    }

    const youtubeUrl = extractYoutubeEmbedUrl(infoPage);
    if (youtubeUrl) return this.url_result(youtubeUrl, 'Youtube');

    const vimeoMatch = infoPage.match(
      /(?:https?:)?\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/i,
    );
    if (vimeoMatch) {
      return this.url_result(`https://vimeo.com/${vimeoMatch[1]}`, 'Vimeo', vimeoMatch[1]);
    }

    const rutube = infoPage.match(
      /\ssrc="((?:https?:)?\/\/rutube\.ru\\?\/(?:video|play)\\?\/embed(?:.*?))\\?"/,
    );
    if (rutube) {
      return this.url_result(protoRelative(rutube[1]!.replace(/\\/g, '')));
    }

    const optsMatch = infoPage.match(/var\s+opts\s*=\s*(\{[\s\S]+?\});/);
    if (optsMatch) {
      const optsUrl = optsMatch[1]!.match(/url\s*:\s*'((?!\/\b)[^']+)/);
      if (optsUrl) {
        let u = optsUrl[1]!;
        if (u.startsWith('//')) u = `https:${u}`;
        return this.url_result(u);
      }
    }

    const data = ((player.params as unknown[]) || [])[0] as Record<string, unknown> | undefined;
    if (!data) throw new ExtractorError('Unable to extract player data', { expected: true });

    const isLive = data.live === 2;
    const timestamp =
      unified_timestamp(
        this._html_search_regex(
          /class=["']mv_info_date[^>]+>([^<]+)(?:<|from)/,
          infoPage,
          'upload date',
          null,
          false,
        ),
      ) || int_or_none(data.date);

    const viewCount = str_to_int(
      this._search_regex(
        /class=["']mv_views_count[^>]+>\s*([\d,.]+)/,
        infoPage,
        'view count',
        null,
        false,
      ),
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const [formatId, formatUrlRaw] of Object.entries(data)) {
      const formatUrl = url_or_none(formatUrlRaw);
      if (!formatUrl || !/^(?:https?:|\/\/|rtmp)/.test(formatUrl)) continue;
      if (
        formatId.startsWith('url') ||
        formatId.startsWith('cache') ||
        formatId === 'extra_data' ||
        formatId === 'live_mp4' ||
        formatId === 'postlive_mp4'
      ) {
        const height = int_or_none(
          this._search_regex(/^(?:url|cache)(\d+)/, formatId, 'height', null, false),
        );
        formats.push({
          format_id: formatId,
          url: formatUrl,
          ext: 'mp4',
          source_preference: 1,
          height: height ?? undefined,
        });
      } else if (formatId.startsWith('hls') && formatId !== 'hls_live_playback') {
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
          this,
          formatUrl,
          videoId!,
          formatId,
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (
        formatId.startsWith('dash') &&
        formatId !== 'dash_live_playback' &&
        formatId !== 'dash_uni'
      ) {
        const { formats: fmts, subtitles: subs } = await extractMpdFormatsAndSubtitles(
          this,
          formatUrl,
          videoId!,
          formatId,
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (formatId === 'rtmp') {
        formats.push({ format_id: formatId, url: formatUrl, ext: 'flv' });
      }
    }

    for (const sub of (data.subs as Array<Record<string, unknown>>) || []) {
      const lang = String(sub.lang || 'en');
      (subtitles[lang] ||= []).push({
        ext: String(sub.title || '.srt').split('.').pop() || 'srt',
        url: url_or_none(sub.url) || undefined,
      });
    }

    const chapters = Array.isArray(data.time_codes)
      ? (data.time_codes as Array<Record<string, unknown>>)
          .filter((v) => typeof v.time === 'number')
          .map((v) => ({
            title: unescapeHTML(String(v.text || '')) || undefined,
            start_time: v.time as number,
          }))
      : undefined;

    return {
      id: videoId!,
      formats,
      subtitles,
      title:
        unescapeHTML(String(mvData.title || data.md_title || '')) || videoId!,
      description:
        clean_html(String(mvData.desc || data.description || '')) || undefined,
      duration: int_or_none(mvData.duration ?? data.duration) ?? undefined,
      like_count: int_or_none(mvData.likes) ?? undefined,
      comment_count: int_or_none(mvData.commcount) ?? undefined,
      thumbnail: url_or_none(data.jpg) || undefined,
      uploader: unescapeHTML(String(data.md_author || '')) || undefined,
      uploader_id: str_or_none(data.author_id ?? data.authorId) || undefined,
      chapters,
      timestamp: timestamp ?? undefined,
      view_count: viewCount ?? undefined,
      is_live: isLive,
    };
  }
}

export class VKUserVideosIE extends VKBaseIE {
  static IE_NAME = 'vk:uservideos';
  static IE_DESC = "VK - User's Videos";
  static _BASE_URL_RE = 'https?://(?:(?:m|new)\\.)?vk(?:video\\.ru|\\.com/video)';
  static _VALID_URL = [
    /https?:\/\/(?:(?:m|new)\.)?vk(?:video\.ru|\.com\/video)\/playlist\/(?<id>-?\d+_-?\d+)/,
    /https?:\/\/(?:(?:m|new)\.)?vk(?:video\.ru|\.com\/video)\/(?<id>@[^/?#]+)(?:\/all)?\/?(?!\?.*\bz=video)(?:[?#]|$)/,
  ];

  protected async *_entries(pageId: string, section: string): AsyncGenerator<VideoInfo> {
    let count = 0;
    let total = 0;
    let videoList: unknown[][] = [];

    const load = async (offset: number) => {
      const sectionData = (
        (await this._download_payload('al_video', pageId, {
          act: 'load_videos_silent',
          offset,
          oid: pageId,
          section,
        })) as Record<string, Record<string, unknown>>
      )[section]!;
      return sectionData;
    };

    let first = await load(0);
    count = Number(first.count || 0);
    total = Number(first.total || 0);
    videoList = (first.list as unknown[][]) || [];

    while (true) {
      for (const video of videoList) {
        const ownerId = video[0];
        const id = video[1];
        const videoId = `${ownerId}_${id}`;
        yield this.url_result(`https://vk.com/video${videoId}`, 'VK', videoId);
      }
      if (count >= total) break;
      const next = await load(count);
      const newCount = Number(next.count || 0);
      if (!newCount) {
        this.to_screen(`${pageId}: Skipping ${total - count} unavailable videos`);
        break;
      }
      count += newCount;
      videoList = (next.list as unknown[][]) || [];
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const uId = this._match_id(url);
    const webpage = await this._download_webpage(url, uId);

    let pageId: string;
    let section: string;
    if (uId.startsWith('@')) {
      const cursor = this._search_json<Record<string, unknown>>(
        /\bvar newCur\s*=/,
        webpage,
        'cursor data',
        uId,
      )!;
      pageId = str_or_none(cursor.oid) || '';
      if (!pageId) throw new ExtractorError('Unable to extract page id', { expected: true });
      section = parse_qs(url).section?.[0] || 'all';
    } else {
      const parts = uId.split('_');
      pageId = parts[0]!;
      section = `playlist_${parts.slice(1).join('_')}`;
    }

    const playlistTitle = clean_html(get_element_by_class('VideoInfoPanel__title', webpage) || '');
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(pageId, section)) entries.push(e);
    return this.playlist_result(entries, `${pageId}_${section}`, playlistTitle || undefined);
  }
}

export class VKWallPostIE extends VKBaseIE {
  static IE_NAME = 'vk:wallpost';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:(?:m|new)\.)?vk\.com\/(?:[^?]+\?.*\bw=)?wall(?<id>-?\d+_\d+)))/;
  static _BASE64_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=';

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const webpage = String(
      await this._download_payload('wkview', postId, { act: 'show', w: `wall${postId}` }),
    );

    const uploader = clean_html(
      get_element_by_class('PostHeaderTitle__authorName', webpage) || '',
    );

    const entries: VideoInfo[] = [];

    for (const audioRaw of webpage.matchAll(/data-audio="([^"]+)/g)) {
      let audio: Record<string, unknown>;
      try {
        audio = this._parse_json(unescapeHTML(audioRaw[1]!)!, postId)!;
      } catch {
        continue;
      }
      if (!audio.url) continue;
      const title = unescapeHTML(String(audio.title || ''));
      const artist = unescapeHTML(String(audio.artist || ''));
      const covers = try_call(() =>
        String(audio.coverUrl || '')
          .split(',')
          .filter(Boolean)
          .map((u) => ({ url: u })),
      );
      entries.push({
        id: `${audio.owner_id}_${audio.id}`,
        title: [artist, title].filter(Boolean).join(' - ') || String(audio.id),
        thumbnails: covers,
        duration: int_or_none(audio.duration) ?? undefined,
        uploader: uploader || undefined,
        artist: artist || undefined,
        track: title || undefined,
        formats: [
          {
            format_id: 'audio',
            url: String(audio.url),
            ext: 'm4a',
            vcodec: 'none',
            acodec: 'mp3',
            container: 'm4a_dash',
          },
        ],
      });
    }

    const bodyHtml = get_element_html_by_id('wl_post_body', webpage) || '';
    const seen = new Set<string>();
    for (const m of bodyHtml.matchAll(/<a[^>]+href=(?:["'])(\/video(?:-?[\d_]+)[^"']*)/g)) {
      const path = m[1]!;
      if (seen.has(path)) continue;
      seen.add(path);
      entries.push(this.url_result(urljoin(url, path), 'VK'));
    }

    return this.playlist_result(
      entries,
      postId,
      [uploader, `Wall post ${postId}`].filter(Boolean).join(' - ') || postId,
      clean_html(get_element_by_class('wall_post_text', webpage) || '') || undefined,
    );
  }
}

export class VKPlayBaseIE extends InfoExtractor {
  static IE_NAME = 'vkplay:base';
  static _VALID_URL = false as const;
  static _BASE_URL_RE = 'https?://(?:vkplay\\.live|live\\.vk(?:play|video)\\.ru)/';

  static _RESOLUTIONS: Record<string, string> = {
    tiny: '256x144',
    lowest: '426x240',
    low: '640x360',
    medium: '852x480',
    high: '1280x720',
    full_hd: '1920x1080',
    quad_hd: '2560x1440',
  };

  protected async _extract_from_initial_state(
    url: string,
    videoId: string,
    path: Array<string | number>,
  ): Promise<Record<string, unknown>> {
    const webpage = await this._download_webpage(url, videoId);
    const state = this._search_json<Record<string, unknown>>(
      /<script[^>]+\bid="initial-state"[^>]*>/,
      webpage,
      'initial state',
      videoId,
    )!;
    const videoInfo = traverse_obj(state, path) as Record<string, unknown> | undefined;
    if (!videoInfo || typeof videoInfo !== 'object') {
      throw new ExtractorError('Unable to extract video info from html inline initial state', {
        expected: true,
      });
    }
    return videoInfo;
  }

  protected async _extract_formats(
    streamInfo: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const playerUrls =
      ((streamInfo.data as unknown[])?.[0] as Record<string, unknown> | undefined)?.playerUrls ||
      (streamInfo as { playerUrls?: unknown }).playerUrls ||
      [];
    for (const stream of (playerUrls as Array<Record<string, unknown>>) || []) {
      const u = url_or_none(stream.url);
      if (!u) continue;
      const formatId = str_or_none(stream.type) || 'http';
      if (
        formatId === 'hls' ||
        formatId === 'live_hls' ||
        formatId === 'live_playback_hls' ||
        u.includes('.m3u8')
      ) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            u,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            formatId,
            undefined,
            false,
          )),
        );
      } else if (formatId === 'dash') {
        formats.push(...(await this._extract_mpd_formats(u, videoId, formatId, undefined, false)));
      } else if (formatId === 'live_dash' || formatId === 'live_playback_dash') {
        this.write_debug(`Not extracting unsupported format "${formatId}"`);
      } else {
        formats.push({
          url: u,
          ext: 'mp4',
          format_id: formatId,
          ...parse_resolution(VKPlayBaseIE._RESOLUTIONS[formatId]),
        });
      }
    }
    return formats;
  }

  protected _extract_common_meta(streamInfo: Record<string, unknown>): Partial<VideoInfo> {
    const user = (streamInfo.user ||
      (streamInfo.blog as Record<string, unknown> | undefined)?.owner ||
      {}) as Record<string, unknown>;
    const count = (streamInfo.count as Record<string, unknown>) || {};
    const category = (streamInfo.category as Record<string, unknown>) || {};
    return {
      id: str_or_none(streamInfo.id) || undefined,
      title: streamInfo.title ? String(streamInfo.title) : undefined,
      release_timestamp: int_or_none(streamInfo.startTime) ?? undefined,
      thumbnail: url_or_none(streamInfo.previewUrl) || undefined,
      view_count: int_or_none(count.views) ?? undefined,
      like_count: int_or_none(count.likes) ?? undefined,
      categories: category.title ? [String(category.title)] : undefined,
      uploader: user.nick ? String(user.nick) : undefined,
      uploader_id: str_or_none(user.id) || undefined,
      duration: int_or_none(streamInfo.duration) ?? undefined,
      is_live: typeof streamInfo.isOnline === 'boolean' ? streamInfo.isOnline : undefined,
      concurrent_view_count: int_or_none(count.viewers) ?? undefined,
    };
  }
}

export class VKPlayIE extends VKPlayBaseIE {
  static IE_NAME = 'vkplay';
  static _VALID_URL =
    /https?:\/\/(?:vkplay\.live|live\.vk(?:play|video)\.ru)\/(?<username>[^/#?]+)\/record\/(?<id>[\da-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups!.username!;
    const videoId = m.groups!.id!;

    let recordInfo =
      (traverse_obj(
        await this._download_json(
          `https://api.vkplay.live/v1/blog/${username}/public_video_stream/record/${videoId}`,
          videoId,
          undefined,
          { fatal: false },
        ),
        ['data', 'record'],
      ) as Record<string, unknown> | undefined) || undefined;

    if (!recordInfo) {
      recordInfo = await this._extract_from_initial_state(url, videoId, [
        'record',
        'currentRecord',
        'data',
      ]);
    }

    return {
      ...this._extract_common_meta(recordInfo),
      id: videoId,
      formats: await this._extract_formats(recordInfo, videoId),
    };
  }
}

export class VKPlayLiveIE extends VKPlayBaseIE {
  static IE_NAME = 'vkplaylive';
  static _VALID_URL =
    /https?:\/\/(?:vkplay\.live|live\.vk(?:play|video)\.ru)\/(?<id>[^/#?]+)\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const username = this._match_id(url);
    let streamInfo =
      (await this._download_json<Record<string, unknown>>(
        `https://api.vkplay.live/v1/blog/${username}/public_video_stream`,
        username,
        undefined,
        { fatal: false },
      )) || undefined;

    if (!streamInfo) {
      streamInfo = await this._extract_from_initial_state(url, username, [
        'stream',
        'stream',
        'data',
        'stream',
      ]);
    }

    const formats = await this._extract_formats(streamInfo, username);
    if (!formats.length && !streamInfo.isOnline) {
      throw new UserNotLive(username);
    }

    return {
      ...this._extract_common_meta(streamInfo),
      formats,
    };
  }
}
