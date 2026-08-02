/**
 * GameJolt family — ported from yt-dlp gamejolt.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext, int_or_none, str_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, format_field } from './_helpers';

export class GameJoltBaseIE extends InfoExtractor {
  static IE_NAME = 'gamejoltbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_BASE = 'https://gamejolt.com/site-api/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('GameJoltBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi<T = unknown>(endpoint: string, videoId: string, opts?: Record<string, unknown>): Promise<T> {
    const headers = { Accept: 'image/webp,*/*', ...(opts?.headers as Record<string, string> | undefined) };
    const data = await this._download_json<{ payload: T }>(
      `${GameJoltBaseIE._API_BASE}${endpoint}`,
      videoId,
      undefined,
      { ...opts, headers },
    );
    return data.payload;
  }

  protected _parseContentAsText(content: Record<string, unknown>): string {
    const outerContents = (content.content as Array<Record<string, unknown>>) || [];
    const joined: string[] = [];
    for (const outerContent of outerContents) {
      if (outerContent.type !== 'paragraph') {
        joined.push(this._parseContentAsText(outerContent));
        continue;
      }
      let innerText = '';
      for (const innerContent of (outerContent.content as Array<Record<string, unknown>>) || []) {
        if (innerContent.text) innerText += String(innerContent.text);
        else if (innerContent.type === 'hardBreak') innerText += '\n';
      }
      joined.push(innerText);
    }
    return joined.join('\n');
  }

  protected async _parsePost(postData: Record<string, unknown>): Promise<VideoInfo> {
    const postId = String(postData.hash ?? '');
    const leadContent =
      this._parse_json<Record<string, unknown>>(String(postData.lead_content ?? '{}'), postId, undefined, false) || {};
    let description = (postData.leadStr as string | undefined) || this._parseContentAsText(leadContent);
    let fullDescription: string | undefined;
    if (postData.has_article) {
      const articleRaw =
        postData.article_content ||
        (
          await this._callApi<{ article?: string }>(`web/posts/article/${postData.id ?? postId}`, postId, {
            note: 'Downloading article metadata',
            fatal: false,
          })
        ).article;
      const articleContent =
        this._parse_json<Record<string, unknown>>(String(articleRaw ?? '{}'), postId, undefined, false) || {};
      fullDescription = this._parseContentAsText(articleContent);
    }

    const userData = (postData.user as Record<string, unknown>) || {};
    const infoDict: VideoInfo = {
      extractor_key: 'GameJolt',
      extractor: 'GameJolt',
      webpage_url: str_or_none(postData.url) || `https://gamejolt.com/p/${postId}`,
      id: postId,
      title: description,
      description: fullDescription || description,
      display_id: postData.slug as string | undefined,
      uploader: (userData.display_name as string | undefined) || (userData.name as string | undefined),
      uploader_id: userData.username as string | undefined,
      uploader_url: format_field(userData, 'url', 'https://gamejolt.com%s') || undefined,
      categories: ((postData.communities as Array<Record<string, unknown>>) || []).map((category) => {
        const community = (category.community as Record<string, unknown>) || {};
        const channel = (category.channel as Record<string, unknown>) || {};
        return `${community.name} - ${channel.display_title || channel.title}`;
      }),
      tags: traverse_obj(leadContent, ['content', 'ALL', 'content', 'ALL', 'marks', 'ALL', 'attrs', 'tag']) as
        | string[]
        | undefined,
      like_count: int_or_none(postData.like_count) ?? undefined,
      comment_count: int_or_none(postData.comment_count) ?? undefined,
      timestamp: int_or_none(postData.added_on, 1000) ?? undefined,
      release_timestamp: int_or_none(postData.published_on, 1000) ?? undefined,
    };

    const videoList = traverse_obj(postData, ['videos', 'ALL'], { get_all: true }) as
      | Array<Record<string, unknown>>
      | undefined;
    const videoData = videoList?.[0] || ({} as Record<string, unknown>);
    const formats: Format[] = [];
    const subtitles: VideoInfo['subtitles'] = {};
    const thumbnails: Thumbnail[] = [];

    for (const media of (videoData.media as Array<Record<string, unknown>>) || []) {
      const mediaUrl = String(media.img_url ?? '');
      const mimetype = String(media.filetype ?? '');
      const ext = determine_ext(mediaUrl);
      const mediaId = (media.type as string | undefined) || ext || 'http';
      if (mimetype === 'application/vnd.apple.mpegurl' || ext === 'm3u8') {
        const { formats: hls, subtitles: subs } = await extractM3u8FormatsAndSubtitles(this, mediaUrl, postId, mediaId);
        formats.push(...hls);
        for (const [lang, tracks] of Object.entries(subs || {})) (subtitles[lang] ||= []).push(...tracks);
      } else if (mimetype === 'application/dash+xml' || ext === 'mpd') {
        const { formats: dash, subtitles: subs } = await extractMpdFormatsAndSubtitles(this, mediaUrl, postId, mediaId);
        formats.push(...dash);
        for (const [lang, tracks] of Object.entries(subs || {})) (subtitles[lang] ||= []).push(...tracks);
      } else if (mimetype.includes('image')) {
        thumbnails.push({
          id: mediaId,
          url: mediaUrl,
          width: media.width as number | undefined,
          height: media.height as number | undefined,
        });
      } else {
        formats.push({
          format_id: mediaId,
          url: mediaUrl,
          width: media.width as number | undefined,
          height: media.height as number | undefined,
          filesize: media.filesize as number | undefined,
          acodec: mediaUrl.includes('video-card') ? 'none' : undefined,
        });
      }
    }

    if (formats.length) {
      return {
        ...infoDict,
        formats,
        subtitles,
        thumbnails,
        view_count: int_or_none(videoData.view_count) ?? undefined,
      };
    }

    const gifEntries: VideoInfo[] = [];
    for (const media of (postData.media as Array<Record<string, unknown>>) || []) {
      const imgUrl = String(media.img_url ?? '');
      if (determine_ext(imgUrl) !== 'gif' || !String(media.filetype ?? '').includes('gif')) continue;
      gifEntries.push({
        id: String(media.hash ?? ''),
        title: String(media.filename ?? '').split('.')[0] || String(media.hash ?? ''),
        formats: (['img_url', 'mediaserver_url', 'mediaserver_url_mp4', 'mediaserver_url_webm'] as const)
          .filter((key) => media[key])
          .map((key) => ({
            format_id: key,
            url: String(media[key]),
            width: key === 'img_url' ? (media.width as number | undefined) : undefined,
            height: key === 'img_url' ? (media.height as number | undefined) : undefined,
            acodec: 'none',
          })),
      });
    }
    if (gifEntries.length) return { _type: 'playlist', ...infoDict, entries: gifEntries };

    const embedUrls = traverse_obj(postData, ['embeds', 'ALL', 'url'], { get_all: true }) as string[] | undefined;
    const embedUrl = embedUrls?.[0];
    if (embedUrl) return this.url_result(embedUrl);
    return infoDict;
  }
}

export class GameJoltIE extends GameJoltBaseIE {
  static IE_NAME = 'gamejolt';
  static _VALID_URL = /https?:\/\/(?:www\.)?gamejolt\.com\/p\/(?:[\w-]*-)?(?<id>\w{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const postData = (await this._callApi<{ post: Record<string, unknown> }>(`web/posts/view/${postId}`, postId)).post;
    return this._parsePost(postData);
  }
}

export class GameJoltPostListBaseIE extends GameJoltBaseIE {
  static IE_NAME = 'gamejoltpostlistbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async *_entries(
    endpoint: string,
    listId: string,
    note = 'Downloading post list',
    initialItems: Array<Record<string, unknown>> = [],
  ): AsyncGenerator<VideoInfo> {
    let scrollId: unknown;
    let pageNum = 1;
    let items =
      initialItems.length > 0
        ? initialItems
        : ((await this._callApi<{ items: Array<Record<string, unknown>> }>(endpoint, listId, { note })).items || []);

    while (items.length) {
      for (const item of items) {
        yield await this._parsePost((item.action_resource_model as Record<string, unknown>) || {});
      }
      scrollId = items[items.length - 1]?.scroll_id;
      pageNum += 1;
      const next = await this._callApi<{ items?: Array<Record<string, unknown>> }>(endpoint, listId, {
        note: `${note} page ${pageNum}`,
        data: JSON.stringify({ scrollDirection: 'from', scrollId }),
      });
      items = next.items || [];
    }
  }
}

export class GameJoltUserIE extends GameJoltPostListBaseIE {
  static IE_NAME = 'gamejoltuser';
  static _VALID_URL = /https?:\/\/(?:www\.)?gamejolt\.com\/@(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    const userData = (await this._callApi<{ user: Record<string, unknown> }>(`web/profile/@${userId}`, userId)).user;
    const bio = this._parseContentAsText(
      this._parse_json(String(userData.bio_content ?? '{}'), userId, undefined, false) || {},
    );
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(`web/posts/fetch/user/@${userId}?tab=active`, userId, 'Downloading user posts')) {
      entries.push(entry);
    }
    return this.playlist_result(
      entries,
      str_or_none(userData.id) || userId,
      (userData.display_name as string | undefined) || (userData.name as string | undefined),
      bio,
    );
  }
}

export class GameJoltGameIE extends GameJoltPostListBaseIE {
  static IE_NAME = 'gamejoltgame';
  static _VALID_URL = /https?:\/\/(?:www\.)?gamejolt\.com\/games\/[\w-]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const gameId = this._match_id(url);
    const gameData = (await this._callApi<{ game: Record<string, unknown> }>(`web/discover/games/${gameId}`, gameId)).game;
    const description = this._parseContentAsText(
      this._parse_json(String(gameData.description_content ?? '{}'), gameId, undefined, false) || {},
    );
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(`web/posts/fetch/game/${gameId}`, gameId, 'Downloading game posts')) {
      entries.push(entry);
    }
    return this.playlist_result(entries, gameId, gameData.title as string | undefined, description);
  }
}

export class GameJoltGameSoundtrackIE extends GameJoltBaseIE {
  static IE_NAME = 'gamejoltgamesoundtrack';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gamejolt\.com\/get\/soundtrack(?:\?|\#!?)(?:.*?[&;])??game=(?<id>(?:\d+)+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const gameId = this._match_id(url);
    const gameOverview = await this._callApi<Record<string, unknown>>(`web/discover/games/overview/${gameId}`, gameId);
    const entries = ((gameOverview.songs as Array<Record<string, unknown>>) || [])
      .filter((song) => song.url)
      .map((song) =>
        this.url_result(String(song.url), undefined, str_or_none(song.id) || undefined, str_or_none(song.title) || undefined),
      );
    const title =
      str_or_none(traverse_obj(gameOverview, ['microdata', 'name'])) ||
      str_or_none(traverse_obj(gameOverview, ['twitter', 'title'])) ||
      str_or_none(traverse_obj(gameOverview, ['fb', 'title'])) ||
      undefined;
    return this.playlist_result(entries, gameId, title);
  }
}

export class GameJoltCommunityIE extends GameJoltPostListBaseIE {
  static IE_NAME = 'gamejoltcommunity';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gamejolt\.com\/c\/(?<id>(?<community>[\w-]+)(?:\/(?<channel>[\w-]+))?)(?:(?:\?|\#!?)(?:.*?[&;])??sort=(?<sort>\w+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const communityId = m.groups!.community!;
    const channelId = m.groups!.channel || 'featured';
    const sortBy = m.groups!.sort || 'new';

    const communityData = (await this._callApi<{ community: Record<string, unknown> }>(
      `web/communities/view/${communityId}`,
      displayId,
    )).community;
    const channelData =
      (
        await this._callApi<{ channel?: Record<string, unknown> }>(
          `web/communities/view-channel/${communityId}/${channelId}`,
          displayId,
          { fatal: false },
        )
      ).channel || {};
    const title = `${communityData.name || communityId} - ${channelData.display_title || channelId}`;
    const description = this._parseContentAsText(
      this._parse_json(String(communityData.description_content ?? '{}'), displayId, undefined, false) || {},
    );
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(
      `web/posts/fetch/community/${communityId}?channels[]=${sortBy}&channels[]=${channelId}`,
      displayId,
      'Downloading community posts',
    )) {
      entries.push(entry);
    }
    return this.playlist_result(entries, `${communityId}/${channelId}`, title, description);
  }
}

export class GameJoltSearchIE extends GameJoltPostListBaseIE {
  static IE_NAME = 'gamejoltsearch';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gamejolt\.com\/search(?:\/(?<filter>communities|users|games))?(?:\?|\#!?)(?:.*?[&;])??q=(?<id>(?:[^&#]+)+)/;

  static _URL_FORMATS: Record<string, string> = {
    users: 'https://gamejolt.com/@{username}',
    communities: 'https://gamejolt.com/c/{path}',
    games: 'https://gamejolt.com/games/{slug}/{id}',
  };

  protected async *_searchEntries(query: string, filterMode: string, displayQuery: string): AsyncGenerator<VideoInfo> {
    const initial = await this._callApi<Record<string, unknown>>(
      `web/search/${filterMode}?q=${encodeURIComponent(query)}`,
      displayQuery,
    );
    const entriesNum = Number(initial.count ?? initial[`${filterMode}Count`] ?? 0);
    if (!entriesNum) return;
    const perPage = Number(initial.perPage ?? 20);
    const pages = Math.ceil(entriesNum / perPage);
    for (let page = 1; page <= pages; page++) {
      const searchResults = await this._callApi<Record<string, unknown>>(
        `web/search/${filterMode}?q=${encodeURIComponent(query)}&page=${page}`,
        displayQuery,
      );
      for (const result of (searchResults[filterMode] as Array<Record<string, unknown>>) || []) {
        const pattern = GameJoltSearchIE._URL_FORMATS[filterMode]!;
        yield this.url_result(
          pattern
            .replace('{username}', String(result.username ?? ''))
            .replace('{path}', String(result.path ?? ''))
            .replace('{slug}', String(result.slug ?? ''))
            .replace('{id}', String(result.id ?? '')),
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const filterMode = m.groups!.filter;
    const query = decodeURIComponent(m.groups!.id!);
    const entries: VideoInfo[] = [];

    if (filterMode) {
      for await (const entry of this._searchEntries(query, filterMode, query)) entries.push(entry);
    } else {
      const initial = await this._callApi<{ posts?: Array<Record<string, unknown>> }>(
        `web/search?q=${encodeURIComponent(query)}`,
        query,
      );
      for await (const entry of this._entries(
        `web/posts/fetch/search/${encodeURIComponent(query)}`,
        query,
        'Downloading initial post list',
        initial.posts || [],
      )) {
        entries.push(entry);
      }
    }

    return this.playlist_result(entries, query, query);
  }
}
