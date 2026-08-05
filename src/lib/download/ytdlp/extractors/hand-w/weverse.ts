// @ts-nocheck
/** Weverse* IEs â€?ported from yt-dlp weverse.py */

import { createHmac, randomUUID } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  jwtDecodePayload,
  UserNotLive,
} from './_helpers';

const ACCOUNT_API_BASE = 'https://accountapi.weverse.io';
const CLIENT_PLATFORM = 'WEB';
const SIGNING_KEY = '1b9cb6378d959b45714bec49971ade22e6e24e42';
const ACCESS_TOKEN_KEY = 'we2_access_token';
const REFRESH_TOKEN_KEY = 'we2_refresh_token';
const DEVICE_ID_KEY = 'we2_device_id';
const OAUTH_PREFIX = 'oauth';

const API_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  Origin: 'https://weverse.io',
  Referer: 'https://weverse.io/',
};

const LOGIN_HINT =
  `You can log in using your refresh token with --username "${OAUTH_PREFIX}" --password "REFRESH_TOKEN" ` +
  `(replace REFRESH_TOKEN with the actual value of the "${REFRESH_TOKEN_KEY}" cookie). ` +
  'Or else use session cookies from your browser.';

const CAPTION_EXT_RE = /\.(?:ttml|vtt)/i;

/** Shared oauth token bag (module-level â€?mirrors upstream class attrs; no cookiejar/cache). */
const oauthTokens: Record<string, string> = {};
let sharedDeviceId: string | null = null;

function processNaverSubtitles(
  vodData: Record<string, unknown>,
  processUrl: (url: string) => string[],
): { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } {
  const ret: { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } = {
    subtitles: {},
    automatic_captions: {},
  };
  const fanCounts: Record<string, Record<string, number>> = { subtitles: {}, automatic_captions: {} };

  for (const caption of (((vodData.captions as Record<string, unknown>)?.list as Array<Record<string, unknown>>) ||
    [])) {
    const captionUrl = caption.source as string | undefined;
    if (!captionUrl) continue;
    const typeKey = caption.type === 'auto' ? 'automatic_captions' : 'subtitles';
    let lang =
      (caption.locale as string) ||
      [caption.language, caption.country].filter(Boolean).join('-') ||
      'und';
    if (caption.type === 'fan') {
      const n = (fanCounts[typeKey]![lang] = (fanCounts[typeKey]![lang] || 0) + 1);
      lang = `${lang}_fan${n}`;
    }
    const name = [caption.label, caption.fanName].filter(Boolean).join(' - ') || undefined;
    for (const subUrl of processUrl(captionUrl)) {
      const ext = CAPTION_EXT_RE.test(subUrl)
        ? subUrl.replace(CAPTION_EXT_RE, '').split('.').pop() || 'vtt'
        : 'vtt';
      (ret[typeKey][lang] ||= []).push({ url: subUrl, ext, name });
    }
  }
  return ret;
}

function httpStatusFromError(e: unknown): number | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /HTTP\s+(\d+)/i.exec(msg);
  if (m) return Number(m[1]);
  const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
  if (cause) return httpStatusFromError(cause);
  return null;
}

export class WeverseBaseIE extends InfoExtractor {
  static IE_NAME = 'weversebase';
  static _VALID_URL = false as const;
  static _NETRC_MACHINE = 'weverse';

  protected get _isLoggedIn(): boolean {
    return Boolean(oauthTokens[ACCESS_TOKEN_KEY]);
  }

  protected get _oauthHeaders(): Record<string, string> {
    return {
      ...API_HEADERS,
      'X-ACC-APP-SECRET': '5419526f1c624b38b10787e5c10b2a7a',
      'X-ACC-SERVICE-ID': 'weverse',
      'X-ACC-TRACE-ID': randomUUID(),
    };
  }

  protected _reportLoginError(errorId: string): never {
    const map: Record<string, string> = {
      login_required: 'This content is only available for logged-in users. ',
      invalid_username: 'Login username must start with "oauth". ',
      invalid_password:
        'Your password is not a valid refresh token. Pass the refresh token, NOT the access token. ',
      no_refresh_token:
        'Your access token has expired and there is no refresh token available. Refresh cookies and try again. ',
      expired_refresh_token:
        'Your refresh token has expired. Log in again in the browser to get a new refresh token. ',
    };
    throw new ExtractorError(`${map[errorId] || errorId}${LOGIN_HINT}`, { expected: true });
  }

  protected async _accessTokenIsValid(): Promise<boolean> {
    const token = oauthTokens[ACCESS_TOKEN_KEY];
    if (!token) return false;
    try {
      const response = await this._download_json<{ expiresIn?: number }>(
        `${ACCOUNT_API_BASE}/api/v1/token/validate`,
        undefined,
        'Validating access token',
        {
          headers: {
            ...this._oauthHeaders,
            Authorization: `Bearer ${token}`,
          },
          fatal: false,
        },
      );
      return (int_or_none(response.expiresIn) ?? 0) > 60;
    } catch {
      return false;
    }
  }

  protected _tokenIsExpired(key: string): boolean {
    const token = oauthTokens[key];
    if (!token) return true;
    const exp = jwtDecodePayload(token).exp;
    if (typeof exp !== 'number') return true;
    return exp - Date.now() / 1000 < 3600;
  }

  protected async _refreshAccessToken(): Promise<void> {
    if (!oauthTokens[REFRESH_TOKEN_KEY]) this._reportLoginError('no_refresh_token');
    if (this._tokenIsExpired(REFRESH_TOKEN_KEY)) this._reportLoginError('expired_refresh_token');

    const headers: Record<string, string> = {
      ...this._oauthHeaders,
      'Content-Type': 'application/json',
    };
    if (this._isLoggedIn) {
      headers.Authorization = `Bearer ${oauthTokens[ACCESS_TOKEN_KEY]}`;
    }

    try {
      const response = await this._download_json<{
        accessToken?: string;
        refreshToken?: string;
      }>(`${ACCOUNT_API_BASE}/api/v1/token/refresh`, undefined, 'Refreshing access token', {
        headers,
        data: JSON.stringify({ refreshToken: oauthTokens[REFRESH_TOKEN_KEY] }),
        method: 'POST',
      });
      if (!response.accessToken || !response.refreshToken) {
        throw new ExtractorError('Unable to refresh access token', { expected: true });
      }
      oauthTokens[ACCESS_TOKEN_KEY] = response.accessToken;
      oauthTokens[REFRESH_TOKEN_KEY] = response.refreshToken;
    } catch (e) {
      if (httpStatusFromError(e) === 401) {
        delete oauthTokens[ACCESS_TOKEN_KEY];
        delete oauthTokens[REFRESH_TOKEN_KEY];
        this._reportLoginError('expired_refresh_token');
      }
      throw e;
    }
  }

  protected async _getAuthorizationHeader(): Promise<Record<string, string>> {
    if (!this._isLoggedIn) return {};
    if (this._tokenIsExpired(ACCESS_TOKEN_KEY)) {
      const stillValid = await this._accessTokenIsValid();
      if (!stillValid) await this._refreshAccessToken();
    }
    return { Authorization: `Bearer ${oauthTokens[ACCESS_TOKEN_KEY]}` };
  }

  protected async _realInitialize(): Promise<void> {
    const cookies = this._get_cookies('https://weverse.io/');
    if (!sharedDeviceId) {
      sharedDeviceId = cookies[DEVICE_ID_KEY] || randomUUID();
    }
    if (this._isLoggedIn) return;

    if (cookies[ACCESS_TOKEN_KEY]) oauthTokens[ACCESS_TOKEN_KEY] = cookies[ACCESS_TOKEN_KEY];
    if (cookies[REFRESH_TOKEN_KEY]) oauthTokens[REFRESH_TOKEN_KEY] = cookies[REFRESH_TOKEN_KEY];

    if (this._isLoggedIn && !(await this._accessTokenIsValid())) {
      await this._refreshAccessToken();
    }
  }

  protected async _callApi(
    ep: string,
    videoId: string,
    data?: string,
    note = 'Downloading API JSON',
  ): Promise<Record<string, unknown>> {
    await this._realInitialize();
    const apiPath = update_url_query(ep, {
      appId: 'be4d79eb8fc7bd008ee82c8ec4ff6fd4',
      language: 'en',
      os: CLIENT_PLATFORM,
      platform: CLIENT_PLATFORM,
      wpf: 'pc',
    });

    for (const isRetry of [false, true]) {
      const wmsgpad = Date.now();
      const wmd = createHmac('sha1', SIGNING_KEY)
        .update(`${apiPath.slice(0, 255)}${wmsgpad}`)
        .digest('base64');

      try {
        return await this._download_json<Record<string, unknown>>(
          `https://global.apis.naver.com/weverse/wevweb${apiPath}`,
          videoId,
          note,
          {
            data,
            method: data ? 'POST' : 'GET',
            headers: {
              ...API_HEADERS,
              ...(await this._getAuthorizationHeader()),
              ...(data ? { 'Content-Type': 'application/json' } : {}),
              'WEV-device-Id': sharedDeviceId || randomUUID(),
            },
            query: {
              wmsgpad: String(wmsgpad),
              wmd,
            },
          },
        );
      } catch (e) {
        const status = httpStatusFromError(e);
        if (isRetry || status == null) throw e;
        if (this._isLoggedIn && status === 401) {
          await this._refreshAccessToken();
          continue;
        }
        if (status === 403) {
          if (this._isLoggedIn) {
            throw new ExtractorError('Your account does not have access to this content', {
              expected: true,
            });
          }
          this._reportLoginError('login_required');
        }
        throw e;
      }
    }
    throw new ExtractorError('Weverse API call failed', { expected: true });
  }

  protected async _callPostApi(videoId: string): Promise<Record<string, unknown>> {
    const path = this._isLoggedIn ? '' : '/preview';
    return this._callApi(`/post/v1.0/post-${videoId}${path}?fieldSet=postV1`, videoId);
  }

  protected async _getCommunityId(channel: string): Promise<string> {
    const resp = await this._callApi(
      `/community/v1.0/communityIdUrlPathByUrlPathArtistCode?keyword=${channel}`,
      channel,
      undefined,
      'Fetching community ID',
    );
    return String(resp.communityId);
  }

  protected async _getFormats(data: Record<string, unknown>, videoId: string): Promise<Format[]> {
    const formats: Format[] = [];
    const videos = ((data.videos as Record<string, unknown>)?.list as Record<string, unknown>[]) || [];
    for (const v of videos) {
      const source = url_or_none(v.source);
      if (!source) continue;
      const enc = (v.encodingOption || {}) as Record<string, unknown>;
      const bitrate = (v.bitrate || {}) as Record<string, unknown>;
      formats.push({
        url: source,
        width: int_or_none(enc.width),
        height: int_or_none(enc.height),
        vcodec: str_or_none(v.type) || undefined,
        vbr: int_or_none(bitrate.video),
        abr: int_or_none(bitrate.audio),
        filesize: int_or_none(v.size),
        format_id: str_or_none(enc.id) || String(formats.length),
        ext: 'mp4',
        protocol: 'https',
      });
    }

    const streams = (data.streams as Record<string, unknown>[]) || [];
    for (const stream of streams) {
      if (stream.type !== 'HLS' || !url_or_none(stream.source)) continue;
      const query: Record<string, string> = {};
      for (const param of (stream.keys as Record<string, unknown>[]) || []) {
        if (param.type === 'param' && param.name) {
          query[String(param.name)] = String(param.value ?? '');
        }
      }
      let m3u8Url = String(stream.source);
      if (Object.keys(query).length) m3u8Url = update_url_query(m3u8Url, query);
      const fmts = await this._extract_m3u8_formats(
        m3u8Url,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      if (Object.keys(query).length) {
        const extra = new URLSearchParams(query).toString();
        for (const fmt of fmts) {
          if (fmt.url) fmt.url = update_url_query(fmt.url, query);
          fmt.extra_param_to_segment_url = extra;
        }
      }
      formats.push(...fmts);
    }

    return formats;
  }

  protected _getSubs(captionUrl: string): string[] {
    if (CAPTION_EXT_RE.test(captionUrl)) {
      return [
        captionUrl.replace(CAPTION_EXT_RE, '.ttml'),
        captionUrl.replace(CAPTION_EXT_RE, '.vtt'),
      ];
    }
    return [captionUrl];
  }

  protected _parsePostMeta(metadata: Record<string, unknown>): Partial<VideoInfo> {
    const ext = (metadata.extension || {}) as Record<string, unknown>;
    const mediaInfo = (ext.mediaInfo || {}) as Record<string, unknown>;
    const video = (ext.video || {}) as Record<string, unknown>;
    const author = (metadata.author || {}) as Record<string, unknown>;
    const community = (metadata.community || {}) as Record<string, unknown>;
    const thumb =
      url_or_none(traverse_obj(mediaInfo, ['thumbnail', 'url'])) ||
      url_or_none(video.thumb) ||
      undefined;

    return {
      title: str_or_none(mediaInfo.title) || str_or_none(metadata.title) || undefined,
      description: str_or_none(mediaInfo.body) || str_or_none(metadata.body) || undefined,
      uploader: str_or_none(author.profileName) || undefined,
      uploader_id: str_or_none(author.memberId) || undefined,
      creators: community.communityName ? [String(community.communityName)] : undefined,
      channel_id:
        str_or_none(community.communityId) ||
        str_or_none(author.communityId) ||
        undefined,
      duration: float_or_none(video.playTime) ?? undefined,
      timestamp: int_or_none(metadata.publishedAt, 1000) ?? undefined,
      release_timestamp: int_or_none(video.onAirStartAt, 1000) ?? undefined,
      thumbnail: thumb,
      view_count: int_or_none(video.playCount) ?? undefined,
      like_count: int_or_none(video.likeCount) ?? undefined,
      comment_count: int_or_none(metadata.commentCount) ?? undefined,
    };
  }

  protected _extractAvailability(data: Record<string, unknown>): string {
    const video = traverse_obj(data, ['extension', 'video']) as Record<string, unknown> | undefined;
    const src = video || data;
    if (src.paid) return 'premium_only';
    if (src.membershipOnly) return 'subscriber_only';
    return 'needs_auth';
  }

  protected _extractLiveStatus(data: Record<string, unknown>): string {
    const video = (traverse_obj(data, ['extension', 'video']) as Record<string, unknown>) || {};
    if (video.type === 'LIVE') {
      const map: Record<string, string> = {
        ONAIR: 'is_live',
        DONE: 'post_live',
        STANDBY: 'is_upcoming',
        DELAY: 'is_upcoming',
      };
      return map[String(video.status)] || 'is_live';
    }
    return video.liveToVod ? 'was_live' : 'not_live';
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WeverseBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WeverseIE extends WeverseBaseIE {
  static IE_NAME = 'weverse';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<artist>[^/?#]+)\/live\/(?<id>[\d-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channel = m.groups!.artist!;
    const videoId = m.groups!.id!;
    const post = await this._callPostApi(videoId);
    const apiVideoId = String(traverse_obj(post, ['extension', 'video', 'videoId']) || '');
    const availability = this._extractAvailability(post);
    const liveStatus = this._extractLiveStatus(post);
    let videoInfo: Record<string, unknown> = {};
    let formats: Format[] = [];

    if (liveStatus === 'is_upcoming') {
      this.raise_no_formats('Livestream has not yet started', true);
    } else if (liveStatus === 'is_live') {
      videoInfo = await this._callApi(
        `/video/v1.3/lives/${apiVideoId}/playInfo?preview.format=json&preview.version=v2`,
        videoId,
        undefined,
        'Downloading live JSON',
      );
      const playback = this._parse_json(
        String(videoInfo.lipPlayback || '{}'),
        videoId,
      ) as Record<string, unknown>;
      const media = (playback.media as Record<string, unknown>[]) || [];
      const m3u8Url = media
        .map((v) => (v.protocol === 'HLS' ? url_or_none(v.path) : null))
        .find(Boolean);
      if (m3u8Url) {
        const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
        formats = res.formats;
      }
    } else if (liveStatus === 'post_live') {
      if (availability === 'premium_only' || availability === 'subscriber_only') {
        this.report_drm(videoId);
      }
      this.raise_no_formats(
        'Livestream has ended and downloadable VOD is not available',
        true,
      );
    } else {
      const infraVideoId = String(
        traverse_obj(post, ['extension', 'video', 'infraVideoId']) || '',
      );
      const inKeyResp = await this._callApi(
        `/video/v1.1/vod/${apiVideoId}/inKey?preview=false`,
        videoId,
        '{}',
        'Downloading VOD API key',
      );
      const inKey = String(inKeyResp.inKey || '');
      videoInfo = await this._download_json<Record<string, unknown>>(
        `https://global.apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${infraVideoId}`,
        videoId,
        'Downloading VOD JSON',
        {
          query: {
            key: inKey,
            sid: String(traverse_obj(post, ['extension', 'video', 'serviceId']) || '2070'),
            pid: randomUUID(),
            nonce: String(Date.now()),
            devt: 'html5_pc',
            prv: post.membershipOnly ? 'Y' : 'N',
            aup: 'N',
            stpb: 'N',
            cpl: 'en',
            env: 'prod',
            lc: 'en',
            adi: '[{"adSystem":"null"}]',
            adu: '/',
          },
        },
      );
      formats = await this._getFormats(videoInfo, videoId);
      const provider = String(
        traverse_obj(videoInfo, ['meta', 'provider', 'name']) || '',
      ).toLowerCase();
      const hasDrm = provider === 'drm';
      if (hasDrm && formats.length) {
        this.report_warning(
          'Requested content is DRM-protected, only a 30-second preview is available',
        );
      } else if (hasDrm && !formats.length) {
        this.report_drm(videoId);
      }
    }

    return {
      id: videoId,
      channel,
      channel_url: `https://weverse.io/${channel}`,
      formats,
      availability,
      live_status: liveStatus,
      ...this._parsePostMeta(post),
      ...processNaverSubtitles(videoInfo, (u) => this._getSubs(u)),
    };
  }
}

export class WeverseMediaIE extends WeverseBaseIE {
  static IE_NAME = 'weversemedia';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<artist>[^/?#]+)\/media\/(?<id>[\d-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channel = m.groups!.artist!;
    const videoId = m.groups!.id!;
    const post = await this._callPostApi(videoId);
    const mediaType = String(
      traverse_obj(post, ['extension', 'mediaInfo', 'mediaType']) || '',
    ).toLowerCase();
    const youtubeId = str_or_none(traverse_obj(post, ['extension', 'youtube', 'youtubeVideoId']));

    if (mediaType === 'vod') {
      return this.url_result(`https://weverse.io/${channel}/live/${videoId}`, 'Weverse', videoId);
    }
    if (mediaType === 'youtube' && youtubeId) {
      return this.url_result(youtubeId, 'Youtube', youtubeId);
    }
    if (mediaType === 'image') {
      this.raise_no_formats('No video content found in webpage', true);
    }
    if (mediaType) {
      throw new ExtractorError(`Unsupported media type "${mediaType}"`, { expected: true });
    }
    this.raise_no_formats('No video content found in webpage');
  }
}

export class WeverseMomentIE extends WeverseBaseIE {
  static IE_NAME = 'weversemoment';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<artist>[^/?#]+)\/moment\/(?<uid>[\da-f]+)\/post\/(?<id>[\d-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channel = m.groups!.artist!;
    const uploaderId = m.groups!.uid!;
    const videoId = m.groups!.id!;
    const post = await this._callPostApi(videoId);
    const apiVideoId = String(
      traverse_obj(post, ['extension', 'moment', 'video', 'videoId']) || '',
    );
    const playResp = await this._callApi(
      `/cvideo/v1.0/cvideo-${apiVideoId}/playInfo?videoId=${apiVideoId}`,
      videoId,
      undefined,
      'Downloading moment JSON',
    );
    const videoInfo = (playResp.playInfo || {}) as Record<string, unknown>;
    const moment = (traverse_obj(post, ['extension', 'moment']) as Record<string, unknown>) || {};
    const uploadInfo =
      (traverse_obj(moment, ['video', 'uploadInfo']) as Record<string, unknown>) || {};

    return {
      id: videoId,
      channel,
      uploader_id: uploaderId,
      formats: await this._getFormats(videoInfo, videoId),
      availability: this._extractAvailability(post),
      title: str_or_none(moment.body) || str_or_none(post.body) || videoId,
      uploader: str_or_none(traverse_obj(post, ['author', 'profileName'])) || undefined,
      creators: (() => {
        const name =
          str_or_none(traverse_obj(post, ['community', 'communityName'])) ||
          str_or_none(traverse_obj(post, ['author', 'communityName']));
        return name ? [name] : undefined;
      })(),
      channel_id:
        str_or_none(traverse_obj(post, ['community', 'communityId'])) ||
        str_or_none(traverse_obj(post, ['author', 'communityId'])) ||
        undefined,
      duration: float_or_none(uploadInfo.playTime) ?? undefined,
      timestamp: int_or_none(post.publishedAt, 1000) ?? undefined,
      thumbnail: url_or_none(uploadInfo.imageUrl) || undefined,
      like_count: int_or_none(post.emotionCount) ?? undefined,
      comment_count: int_or_none(post.commentCount) ?? undefined,
      ...processNaverSubtitles(videoInfo, (u) => this._getSubs(u)),
    };
  }
}

export class WeverseTabBaseIE extends WeverseBaseIE {
  static IE_NAME = 'weversetabbase';
  static _VALID_URL = false as const;
  static _ENDPOINT: string | null = null;
  static _PATH: string | null = null;
  static _QUERY: Record<string, string> = {};
  static _RESULT_IE_KEY: string | null = null;

  protected async _entries(
    channelId: string,
    channel: string,
    firstPage: Record<string, unknown>,
  ): Promise<VideoInfo[]> {
    const Ctor = this.constructor as typeof WeverseTabBaseIE;
    const endpoint = Ctor._ENDPOINT!;
    const path = Ctor._PATH!;
    const resultIe = Ctor._RESULT_IE_KEY!;
    const query = { ...Ctor._QUERY };
    const out: VideoInfo[] = [];

    for (let page = 1; ; page++) {
      const posts =
        page === 1
          ? firstPage
          : await this._callApi(
              update_url_query(endpoint.replace('%s', channelId), query),
              channel,
              undefined,
              `Downloading ${path} tab page ${page}`,
            );

      for (const post of (posts.data as Record<string, unknown>[]) || []) {
        if (!post.postId) continue;
        out.push({
          ...this.url_result(
            `https://weverse.io/${channel}/${path}/${post.postId}`,
            resultIe,
            String(post.postId),
          ),
          ...this._parsePostMeta(post),
          channel,
          channel_url: `https://weverse.io/${channel}`,
          availability: this._extractAvailability(post),
          live_status: this._extractLiveStatus(post),
        });
      }

      const after = str_or_none(traverse_obj(posts, ['paging', 'nextParams', 'after']));
      if (!after) break;
      query.after = after;
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const Ctor = this.constructor as typeof WeverseTabBaseIE;
    const channel = this._match_id(url);
    const channelId = await this._getCommunityId(channel);
    const firstPage = await this._callApi(
      update_url_query((Ctor._ENDPOINT || '').replace('%s', channelId), Ctor._QUERY),
      channel,
      undefined,
      `Downloading ${Ctor._PATH} tab page 1`,
    );

    const first = ((firstPage.data as Record<string, unknown>[]) || [])[0] || {};
    const playlistTitle = str_or_none(traverse_obj(first, ['community', 'communityName']));
    const thumbnail = url_or_none(traverse_obj(first, ['author', 'profileImageUrl']));

    return {
      ...this.playlist_result(
        await this._entries(channelId, channel, firstPage),
        `${channel}-${Ctor._PATH}`,
        playlistTitle || undefined,
      ),
      thumbnail: thumbnail || undefined,
    };
  }
}

export class WeverseLiveTabIE extends WeverseTabBaseIE {
  static IE_NAME = 'weverselivetab';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<id>[^/?#]+)\/live\/?(?:[?#]|$)/;
  static _ENDPOINT = '/post/v1.0/community-%s/liveTabPosts';
  static _PATH = 'live';
  static _QUERY = { fieldSet: 'postsV1' };
  static _RESULT_IE_KEY = 'Weverse';
}

export class WeverseMediaTabIE extends WeverseTabBaseIE {
  static IE_NAME = 'weversemediatab';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<id>[^/?#]+)\/media(?:\/|\/all|\/new)?(?:[?#]|$)/;
  static _ENDPOINT = '/media/v1.0/community-%s/more';
  static _PATH = 'media';
  static _QUERY = { fieldSet: 'postsV1', filterType: 'RECENT' };
  static _RESULT_IE_KEY = 'WeverseMedia';
}

export class WeverseLiveIE extends WeverseBaseIE {
  static IE_NAME = 'weverselive';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?weverse\.io\/(?<id>[^/?#]+)\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channel = this._match_id(url);
    const channelId = await this._getCommunityId(channel);

    const liveJson = await this._callApi(
      update_url_query(`/post/v1.0/community-${channelId}/liveTab`, {
        debugMessage: 'true',
        fields:
          'onAirLivePosts.fieldSet(postsV1).limit(10),reservedLivePosts.fieldSet(postsV1).limit(10)',
      }),
      channel,
      undefined,
      'Downloading live JSON',
    );

    let videoId: string | undefined;
    for (const key of ['onAirLivePosts', 'reservedLivePosts'] as const) {
      const bucket = liveJson[key] as Record<string, unknown> | undefined;
      for (const post of (bucket?.data as Record<string, unknown>[]) || []) {
        const status = this._extractLiveStatus(post);
        if ((status === 'is_live' || status === 'is_upcoming') && post.postId) {
          videoId = String(post.postId);
          break;
        }
      }
      if (videoId) break;
    }

    if (!videoId) throw new UserNotLive(channel);
    return this.url_result(`https://weverse.io/${channel}/live/${videoId}`, 'Weverse', videoId);
  }
}
