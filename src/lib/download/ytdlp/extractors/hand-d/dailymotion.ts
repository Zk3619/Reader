/**
 * Dailymotion — ported from yt-dlp dailymotion.py
 *
 * Pragmatic notes vs upstream:
 * - m3u8 403-bypass (random headers / browser impersonation retries) omitted; single fetch attempt.
 * - Cookie jar persistence for OAuth tokens is in-memory on the IE instance only.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  str_or_none,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, urlencodePostdata } from './_helpers';

const COMMON_MEDIA_FIELDS = `description
      geoblockedCountries {
        allowed
      }
      xid`;

const DM_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Origin: 'https://www.dailymotion.com',
};

function ageRestricted(defaultAge: number, ageLimit?: number): boolean {
  return (ageLimit ?? 0) >= defaultAge;
}

class DailymotionBaseInfoExtractor extends InfoExtractor {
  static IE_NAME = 'dailymotionbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DailymotionBaseInfoExtractor is not a standalone extractor', {
      expected: true,
    });
  }

  protected _familyFilter: boolean | null = null;
  protected _authHeaders: Record<string, string> = { ...DM_HEADERS };
  protected _accessToken: string | null = null;

  protected _getCookieValue(cookies: Record<string, string>, name: string): string | undefined {
    return cookies[name];
  }

  protected async _realInitialize(): Promise<void> {
    if (this._familyFilter != null) return;
    const cookies = this._get_cookies('https://www.dailymotion.com/');
    const ff = this._getCookieValue(cookies, 'ff');
    this._familyFilter = ff ? ff === 'on' : ageRestricted(18, this.params.age_limit as number | undefined);
  }

  protected async _getToken(xid: string): Promise<string> {
    if (this._accessToken) return this._accessToken;

    const cookies = this._get_cookies('https://www.dailymotion.com/');
    const token =
      this._getCookieValue(cookies, 'access_token') ||
      this._getCookieValue(cookies, 'client_token');
    if (token) {
      this._accessToken = token;
      return token;
    }

    const data: Record<string, string> = {
      client_id: 'f1a362d288c1b98099c7',
      client_secret: 'eea605b96e01c796ff369935357eca920c5da4c5',
      grant_type: 'client_credentials',
    };
    const username = this.params.username as string | undefined;
    const password = this.params.password as string | undefined;
    if (username) {
      data.grant_type = 'password';
      data.username = username;
      data.password = password || '';
    }

    try {
      const resp = await this._download_json<{ access_token?: string; error_description?: string }>(
        'https://graphql.api.dailymotion.com/oauth/token',
        xid,
        'Downloading Access Token',
        {
          data: urlencodePostdata(data),
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      if (!resp.access_token) {
        throw new ExtractorError(resp.error_description || 'No access token', { expected: true });
      }
      this._accessToken = resp.access_token;
      return resp.access_token;
    } catch (e) {
      throw new ExtractorError((e as Error).message || 'OAuth failed', { expected: true });
    }
  }

  protected async _callApi(
    objectType: string,
    xid: string,
    objectFields: string,
    note: string,
    filterExtra?: string | null,
  ): Promise<Record<string, unknown>> {
    await this._realInitialize();
    if (!this._authHeaders.Authorization) {
      this._authHeaders.Authorization = `Bearer ${await this._getToken(xid)}`;
    }

    const filterPart = filterExtra ? `, ${filterExtra}` : '';
    const query = `{
  ${objectType}(xid: "${xid}"${filterPart}) {
    ${objectFields}
  }
}`;

    const resp = await this._download_json<{ data?: Record<string, unknown>; errors?: Array<{ message?: string }> }>(
      'https://graphql.api.dailymotion.com/',
      xid,
      note,
      {
        data: JSON.stringify({ query }),
        method: 'POST',
        headers: this._authHeaders,
      },
    );

    const obj = resp.data?.[objectType] as Record<string, unknown> | null | undefined;
    if (!obj) {
      throw new ExtractorError(resp.errors?.[0]?.message || 'GraphQL error', { expected: true });
    }
    return obj;
  }
}

export class DailymotionIE extends DailymotionBaseInfoExtractor {
  static IE_NAME = 'dailymotion';
  static _GEO_BYPASS = false;
  static _VALID_URL =
    /(?:https?:)?\/\/(?:dai\.ly\/|(?:(?:(?:www|touch|geo)\.)?dailymotion\.[a-z]{2,3}|(?:www\.)?lequipe\.fr)\/(?:swf\/(?!video)|(?:(?:crawler|embed|swf)\/)?video\/|player(?:\/[\da-z]+)?\.html\?(?:video|(?<is_playlist>playlist))=))(?<id>[^/?_&#]+)(?:[\w-]*\?playlist=(?<playlist_id>x[0-9a-z]+))?/i;

  protected _yesPlaylist(playlistId: string | undefined, videoId: string | null | undefined): boolean {
    if (!playlistId) return false;
    if (this.params.noplaylist && videoId) {
      this.to_screen(`Downloading just video ${videoId} because of --no-playlist`);
      return false;
    }
    return true;
  }

  protected async _extractM3u8FormatsAndSubtitles(
    mediaUrl: string,
    videoId: string,
    live = false,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]>; error?: string }> {
    void live;
    try {
      const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, mediaUrl, videoId, 'hls');
      return { formats, subtitles };
    } catch (e) {
      return { formats: [], subtitles: {}, error: (e as Error).message };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggledData] = unsmuggle_url(url, {});
    const m = this._match_valid_url(cleanUrl)!;
    let videoId: string | null | undefined = m.groups?.id;
    const isPlaylist = m.groups?.is_playlist;
    let playlistId: string | null | undefined = m.groups?.playlist_id;

    if (isPlaylist) {
      playlistId = videoId;
      videoId = null;
    }

    if (this._yesPlaylist(playlistId || undefined, videoId)) {
      return this.url_result(
        `http://www.dailymotion.com/playlist/${playlistId}`,
        'DailymotionPlaylist',
        playlistId!,
      );
    }

    const password = this.params.videopassword as string | undefined;
    const mediaFields = `... on Video {
      ${COMMON_MEDIA_FIELDS}
      stats {
        likes { total }
        views { total }
      }
    }
    ... on Live {
      ${COMMON_MEDIA_FIELDS}
      audienceCount
      isOnAir
    }`;

    const media = await this._callApi(
      'media',
      videoId!,
      mediaFields,
      'Downloading media JSON metadata',
      password ? `password: "${password}"` : null,
    );
    const xid = str_or_none(media.xid) || videoId!;

    const metadata = await this._download_json<Record<string, unknown>>(
      `https://www.dailymotion.com/player/metadata/video/${xid}`,
      xid,
      'Downloading metadata JSON',
      {
        query: (smuggledData.query as Record<string, string>) || { app: 'com.dailymotion.neon' },
      },
    );

    const error = metadata.error as Record<string, unknown> | undefined;
    if (error) {
      const title = str_or_none(error.title) || str_or_none(error.raw_message) || 'Unknown error';
      if (error.code === 'DM007') {
        const geo = media.geoblockedCountries as Record<string, unknown> | undefined;
        const allowed = geo?.allowed as string[] | undefined;
        this.raise_geo_restricted(String(title), allowed);
      }
      throw new ExtractorError(`${this.IE_NAME} said: ${title}`, { expected: true });
    }

    const title = str_or_none(metadata.title) || xid;
    const isLive = media.isOnAir === true;
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    let expectedError: string | undefined;

    const qualities = metadata.qualities as Record<string, Array<Record<string, unknown>>> | undefined;
    for (const [quality, mediaList] of Object.entries(qualities || {})) {
      for (const entry of mediaList || []) {
        const mediaUrl = url_or_none(entry.url);
        const mediaType = str_or_none(entry.type);
        if (!mediaUrl || mediaType === 'application/vnd.lumberjack.manifest') continue;

        if (mediaType === 'application/x-mpegURL') {
          const { formats: hls, subtitles: subs, error } = await this._extractM3u8FormatsAndSubtitles(
            mediaUrl,
            videoId!,
            isLive,
          );
          formats.push(...hls);
          mergeSubtitles(subtitles, subs);
          expectedError = error;
        } else {
          const fmt: Format = {
            url: mediaUrl,
            format_id: `http-${quality}`,
          };
          const res = mediaUrl.match(/\/H264-(\d+)x(\d+)(?:-(60)\/)?/);
          if (res) {
            fmt.width = int_or_none(res[1]) ?? undefined;
            fmt.height = int_or_none(res[2]) ?? undefined;
            fmt.fps = int_or_none(res[3]) ?? undefined;
          }
          formats.push(fmt);
        }
      }
    }

    if (!formats.length && expectedError) {
      this.raise_no_formats(expectedError, true);
    }

    for (const f of formats) {
      if (f.url) f.url = f.url.split('#')[0]!;
      if (!f.fps && f.format_id?.endsWith('@60')) f.fps = 60;
    }

    const subtitlesData = (metadata.subtitles as Record<string, unknown> | undefined)?.data as
      | Record<string, { urls?: string[] }>
      | undefined;
    for (const [lang, sub] of Object.entries(subtitlesData || {})) {
      subtitles[lang] = (sub.urls || []).map((subUrl) => ({ url: subUrl, ext: 'vtt' }));
    }

    const thumbnails: Thumbnail[] = [];
    for (const key of ['posters', 'thumbnails']) {
      const obj = metadata[key] as Record<string, string> | undefined;
      if (!obj) continue;
      for (const [id, u] of Object.entries(obj)) {
        const thumbUrl = url_or_none(u);
        if (thumbUrl) thumbnails.push({ id, url: thumbUrl, height: int_or_none(id) ?? undefined });
      }
    }

    const owner = (metadata.owner as Record<string, unknown>) || {};
    const stats = (media.stats as Record<string, Record<string, unknown>>) || {};
    const viewCount =
      int_or_none(stats.views?.total) ?? int_or_none(media.audienceCount) ?? undefined;
    const likeCount = int_or_none(stats.likes?.total) ?? undefined;

    return {
      id: videoId!,
      title,
      description: clean_html(str_or_none(media.description)) || undefined,
      thumbnails,
      duration: int_or_none(metadata.duration) ?? undefined,
      timestamp: int_or_none(metadata.created_time) ?? undefined,
      uploader: str_or_none(owner.screenname) ?? undefined,
      uploader_id: str_or_none(owner.id) || str_or_none(metadata.screenname) || undefined,
      age_limit: metadata.explicit ? 18 : 0,
      tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : undefined,
      view_count: viewCount,
      like_count: likeCount,
      formats,
      subtitles,
      is_live: isLive,
    };
  }
}

export class DailymotionPlaylistBaseIE extends DailymotionBaseInfoExtractor {
  static IE_NAME = 'dailymotionplaylistbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _PAGE_SIZE = 100;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DailymotionPlaylistBaseIE is not a standalone extractor', {
      expected: true,
    });
  }

  protected static _OBJECT_TYPE = 'collection';

  protected async _fetchPage(playlistId: string, page: number): Promise<VideoInfo[]> {
    const pageNum = page + 1;
    const allowExplicit = this._familyFilter ? 'false' : 'true';
    const Ctor = this.constructor as typeof DailymotionPlaylistBaseIE;
    const objectType = Ctor._OBJECT_TYPE;
    const pageSize = Ctor._PAGE_SIZE;

    const videosField = `videos(allowExplicit: ${allowExplicit}, first: ${pageSize}, page: ${pageNum}) {
      edges {
        node {
          xid
          url
        }
      }
    }`;

    const resp = await this._callApi(objectType, playlistId, videosField, `Downloading page ${pageNum}`);
    const videos = resp.videos as { edges?: Array<{ node?: { xid?: string; url?: string } }> } | undefined;
    const entries: VideoInfo[] = [];
    for (const edge of videos?.edges || []) {
      const node = edge.node;
      if (!node?.url || !node.xid) continue;
      entries.push(this.url_result(node.url, 'Dailymotion', node.xid));
    }
    return entries;
  }

  protected async _realExtractPlaylist(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const entries: VideoInfo[] = [];
    const pageSize = (this.constructor as typeof DailymotionPlaylistBaseIE)._PAGE_SIZE;
    for (let page = 0; page < 500; page++) {
      const batch = await this._fetchPage(playlistId, page);
      entries.push(...batch);
      if (batch.length < pageSize) break;
    }
    return this.playlist_result(entries, playlistId);
  }
}

export class DailymotionPlaylistIE extends DailymotionPlaylistBaseIE {
  static IE_NAME = 'dailymotion:playlist';
  static _VALID_URL = /(?:https?:\/\/)?(?:www\.)?dailymotion\.[a-z]{2,3}\/playlist\/(?<id>x[0-9a-z]+)/i;
  static _OBJECT_TYPE = 'collection';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._realExtractPlaylist(url);
  }
}

export class DailymotionSearchIE extends DailymotionPlaylistBaseIE {
  static IE_NAME = 'dailymotion:search';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dailymotion\.[a-z]{2,3}\/search\/(?<id>[^/?#]+)\/videos/i;
  static _PAGE_SIZE = 20;
  static _SEARCH_QUERY =
    'query SEARCH_QUERY( $query: String! $page: Int $limit: Int ) { search { videos( query: $query first: $limit page: $page ) { edges { node { xid } } } } } ';

  protected async _callSearchApi(term: string, page: number, note: string): Promise<Record<string, unknown>> {
    if (!this._authHeaders.Authorization) {
      this._authHeaders.Authorization = `Bearer ${await this._getToken(term)}`;
    }
    const resp = await this._download_json<{ data?: { search?: Record<string, unknown> }; errors?: Array<{ message?: string }> }>(
      'https://graphql.api.dailymotion.com/',
      term,
      note,
      {
        data: JSON.stringify({
          operationName: 'SEARCH_QUERY',
          query: DailymotionSearchIE._SEARCH_QUERY,
          variables: { limit: 20, page, query: term },
        }),
        method: 'POST',
        headers: this._authHeaders,
      },
    );
    const obj = resp.data?.search;
    if (!obj) {
      throw new ExtractorError(resp.errors?.[0]?.message || 'Could not fetch search data', { expected: true });
    }
    return obj;
  }

  protected async _fetchPage(term: string, page: number): Promise<VideoInfo[]> {
    const pageNum = page + 1;
    const response = await this._callSearchApi(term, pageNum, `Searching "${term}" page ${pageNum}`);
    const edges = (response.videos as { edges?: Array<{ node?: { xid?: string } }> })?.edges || [];
    const entries: VideoInfo[] = [];
    for (const edge of edges) {
      const xid = edge.node?.xid;
      if (xid) entries.push(this.url_result(`https://www.dailymotion.com/video/${xid}`, 'Dailymotion', xid));
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const term = decodeURIComponent(this._match_id(url).replace(/\+/g, ' '));
    const entries: VideoInfo[] = [];
    for (let page = 0; page < 500; page++) {
      const batch = await this._fetchPage(term, page);
      entries.push(...batch);
      if (batch.length < DailymotionSearchIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, term, term);
  }
}

export class DailymotionUserIE extends DailymotionPlaylistBaseIE {
  static IE_NAME = 'dailymotion:user';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dailymotion\.[a-z]{2,3}\/(?!(?:embed|swf|#|video|playlist|search|crawler)\/)(?:(?:old\/)?user\/)?(?<id>[^/?#]+)/i;
  static _OBJECT_TYPE = 'channel';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._realExtractPlaylist(url);
  }
}
