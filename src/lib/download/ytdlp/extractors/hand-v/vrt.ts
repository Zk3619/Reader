// @ts-nocheck
/** VRTBaseIE / VRTIE / VrtNUIE / DagelijkseKostIE / Radio1BeIE â€?ported from yt-dlp vrt.py */

import { createHmac } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  filter_dict,
  float_or_none,
  get_element_by_class,
  int_or_none,
  parse_duration,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  jwtDecodePayload,
  make_archive_id,
  mergeSubtitles,
  parse_age_limit,
  parse_iso8601,
  searchNextjsData,
  strip_or_none,
} from './_helpers';

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** yt-dlp jwt_encode (HS256) â€?key is used as UTF-8 bytes (not hex-decoded). */
function jwtEncode(
  payload: Record<string, unknown>,
  key: string,
  headers?: Record<string, string>,
): string {
  const headerData: Record<string, unknown> =
    headers && 'alg' in headers && 'typ' in headers
      ? { ...headers }
      : { alg: 'HS256', typ: 'JWT', ...(headers || {}) };
  const headerB64 = b64url(JSON.stringify(headerData));
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', key)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  return `${headerB64}.${payloadB64}.${b64url(sig)}`;
}

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[0] ?? null;
}

export class VRTBaseIE extends InfoExtractor {
  static IE_NAME = 'vrt:base';
  static _VALID_URL = false as const;
  static _GEO_BYPASS = false;

  static _PLAYER_INFO = {
    platform: 'desktop',
    app: { type: 'browser', name: 'Chrome' },
    device: 'undefined (undefined)',
    os: { name: 'Windows', version: '10' },
    player: {
      name: 'VRT web player',
      version: '5.1.1-prod-2025-02-14T08:44:16"',
    },
  };

  static _JWT_KEY_ID = '0-0Fp51UZykfaiCJrfTE3+oMI8zvDteYfPtR+2n1R+z8w=';
  static _JWT_SIGNING_KEY = 'b5f500d55cb44715107249ccd8a5c0136cfb2788dbb71b90a4f142423bacaf38';

  protected async _extract_formats_and_subtitles(
    data: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    if (traverse_obj(data, 'drm')) this.report_drm(videoId);

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const targets = (data.targetUrls as Array<Record<string, unknown>>) || [];
    for (const target of targets) {
      const formatUrl = url_or_none(target.url);
      const formatType = String(target.type || '').toUpperCase();
      if (!formatUrl || !formatType) continue;
      if (formatType === 'HLS' || formatType === 'HLS_AES') {
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
          this,
          formatUrl,
          videoId,
          formatType,
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (formatType === 'MPEG_DASH') {
        const { formats: fmts, subtitles: subs } = await extractMpdFormatsAndSubtitles(
          this,
          formatUrl,
          videoId,
          formatType,
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (formatType === 'HDS' || formatType === 'HSS') {
        // f4m / ism not fully supported â€?keep direct URL fallback
        formats.push({ format_id: formatType, url: formatUrl });
      } else {
        formats.push({ format_id: formatType, url: formatUrl });
      }
    }

    for (const sub of (data.subtitleUrls as Array<Record<string, unknown>>) || []) {
      if (sub.url && sub.type === 'CLOSED') {
        (subtitles.nl ||= []).push({ url: String(sub.url), ext: 'vtt' });
      }
    }
    return { formats, subtitles };
  }

  protected async _call_api(
    videoId: string,
    client = 'null',
    idToken: string | null = null,
    version = 'v2',
  ): Promise<Record<string, unknown>> {
    const playerInfo = {
      exp: Math.round(Date.now() / 1000 + 900),
      ...VRTBaseIE._PLAYER_INFO,
    };
    const tokenResp = await this._download_json<{ vrtPlayerToken: string }>(
      `https://media-services-public.vrt.be/vualto-video-aggregator-web/rest/external/${version}/tokens`,
      videoId,
      'Downloading player token',
      {
        headers: {
          ...this.geo_verification_headers(),
          'Content-Type': 'application/json',
        },
        method: 'POST',
        data: JSON.stringify({
          identityToken: idToken || '',
          playerInfo: jwtEncode(playerInfo, VRTBaseIE._JWT_SIGNING_KEY, {
            kid: VRTBaseIE._JWT_KEY_ID,
          }),
        }),
      },
    );

    return this._download_json<Record<string, unknown>>(
      `https://media-services-public.vrt.be/vualto-video-aggregator-web/rest/external/${version}/videos/${videoId}`,
      videoId,
      'Downloading API JSON',
      {
        query: { vrtPlayerToken: tokenResp.vrtPlayerToken, client },
      },
    );
  }
}

export class VRTIE extends VRTBaseIE {
  static IE_NAME = 'vrt';
  static IE_DESC = 'VRT NWS, Flanders News, Flandern Info and Sporza';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<site>vrt\.be\/vrtnws|sporza\.be)\/[a-z]{2}\/\d{4}\/\d{2}\/\d{2}\/(?<id>[^/?&#]+)/;

  static _CLIENT_MAP: Record<string, string> = {
    'vrt.be/vrtnws': 'vrtnieuws',
    'sporza.be': 'sporza',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const displayId = m.groups!.id!;
    const webpage = await this._download_webpage(url, displayId);
    const attrs = extract_attributes(getElementHtmlByClass('vrtvideo', webpage) || '');

    let assetId = attrs['data-video-id'] || attrs['data-videoid'];
    if (!assetId) throw new ExtractorError('Unable to extract video id', { expected: true });
    const publicationId = attrs['data-publication-id'] || attrs['data-publicationid'];
    if (publicationId) assetId = `${publicationId}$${assetId}`;
    const client =
      attrs['data-client-code'] || attrs['data-client'] || VRTIE._CLIENT_MAP[site] || 'null';

    const data = await this._call_api(assetId, client);
    const { formats, subtitles } = await this._extract_formats_and_subtitles(data, assetId);

    let description =
      this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage) ||
      undefined;
    if (description === '\u2026') description = undefined;

    return {
      id: assetId,
      formats,
      subtitles,
      description,
      thumbnail: url_or_none(attrs['data-posterimage']) || undefined,
      duration: float_or_none(attrs['data-duration'], 1000) ?? undefined,
      _old_archive_ids: [make_archive_id('Canvas', assetId)],
      title: data.title ? String(data.title) : displayId,
      ...(data.shortDescription ? { description: String(data.shortDescription) } : {}),
      ...(data.duration != null
        ? { duration: float_or_none(data.duration, 1000) ?? undefined }
        : {}),
      ...(url_or_none(data.posterImageUrl)
        ? { thumbnail: url_or_none(data.posterImageUrl)! }
        : {}),
    };
  }
}

export class VrtNUIE extends VRTBaseIE {
  static IE_NAME = 'vrtmax';
  static IE_DESC = 'VRT MAX (formerly VRT NU)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vrt\.be\/(?:vrtnu|vrtmax)\/a-z\/(?:[^/]+\/){2}(?<id>[^/?#&]+)/;
  static _NETRC_MACHINE = 'vrtnu';

  static _TOKEN_COOKIE_DOMAIN = '.www.vrt.be';
  static _ACCESS_TOKEN_COOKIE_NAME = 'vrtnu-site_profile_at';
  static _REFRESH_TOKEN_COOKIE_NAME = 'vrtnu-site_profile_rt';
  static _VIDEO_TOKEN_COOKIE_NAME = 'vrtnu-site_profile_vt';

  static _VIDEO_PAGE_QUERY = `
    query VideoPage($pageId: ID!) {
        page(id: $pageId) {
            ... on EpisodePage {
                episode {
                    ageRaw
                    description
                    durationRaw
                    episodeNumberRaw
                    id
                    name
                    onTimeRaw
                    program {
                        title
                    }
                    season {
                        id
                        titleRaw
                    }
                    title
                    brand
                }
                ldjson
                player {
                    image {
                        templateUrl
                    }
                    modes {
                        streamId
                    }
                }
            }
        }
    }
    `;

  protected _get_vrt_cookie(cookieName: string): string | undefined {
    const cookies = this._get_cookies('https://www.vrt.be/vrtmax/sso');
    return cookies[cookieName];
  }

  protected static _is_jwt_token_expired(token: string): boolean {
    const exp = jwtDecodePayload(token).exp;
    if (typeof exp !== 'number') return true;
    return exp - Date.now() / 1000 < 300;
  }

  /** Simplified: use cookies if present; full SSO login omitted. */
  protected async _fetch_tokens(): Promise<[string | null, string | null]> {
    let accessToken = this._get_vrt_cookie(VrtNUIE._ACCESS_TOKEN_COOKIE_NAME) || null;
    let videoToken = this._get_vrt_cookie(VrtNUIE._VIDEO_TOKEN_COOKIE_NAME) || null;

    if (
      accessToken &&
      !VrtNUIE._is_jwt_token_expired(accessToken) &&
      videoToken &&
      !VrtNUIE._is_jwt_token_expired(videoToken)
    ) {
      return [accessToken, videoToken];
    }

    if (!this._get_vrt_cookie(VrtNUIE._REFRESH_TOKEN_COOKIE_NAME)) {
      return [null, null];
    }

    await this._download_webpage(
      'https://www.vrt.be/vrtmax/sso/refresh',
      undefined,
      'Refreshing tokens',
      { fatal: false },
    );
    accessToken = this._get_vrt_cookie(VrtNUIE._ACCESS_TOKEN_COOKIE_NAME) || null;
    videoToken = this._get_vrt_cookie(VrtNUIE._VIDEO_TOKEN_COOKIE_NAME) || null;
    return [accessToken, videoToken];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const [accessToken, videoToken] = await this._fetch_tokens();

    let pagePath: string;
    try {
      pagePath = new URL(url).pathname;
    } catch {
      pagePath = url;
    }

    const metadataRoot = await this._download_json<{
      data: { page: Record<string, unknown> };
    }>(
      `https://www.vrt.be/vrtnu-api/graphql${accessToken ? '' : '/public'}/v1`,
      displayId,
      'Downloading asset JSON',
      {
        method: 'POST',
        data: JSON.stringify({
          operationName: 'VideoPage',
          query: VrtNUIE._VIDEO_PAGE_QUERY,
          variables: { pageId: pagePath },
        }),
        headers: filter_dict({
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          'Content-Type': 'application/json',
          'x-vrt-client-name': 'WEB',
          'x-vrt-client-version': '1.5.9',
          'x-vrt-zone': 'default',
        }) as Record<string, string>,
      },
    );
    const metadata = metadataRoot.data.page;
    const modes = traverse_obj(metadata, ['player', 'modes']) as
      | Array<Record<string, unknown>>
      | undefined;
    const videoId = String(modes?.[0]?.streamId || '');
    if (!videoId) throw new ExtractorError('Unable to extract stream id', { expected: true });

    let streamingInfo: Record<string, unknown>;
    try {
      streamingInfo = await this._call_api(videoId, 'vrtnu-web@PROD', videoToken);
    } catch (e) {
      if (!videoToken) this.raise_login_required();
      throw e;
    }

    const { formats, subtitles } = await this._extract_formats_and_subtitles(
      streamingInfo,
      videoId,
    );

    const code = streamingInfo.code != null ? String(streamingInfo.code) : '';
    if (!formats.length && code) {
      if (
        [
          'CONTENT_AVAILABLE_ONLY_FOR_BE_RESIDENTS',
          'CONTENT_AVAILABLE_ONLY_IN_BE',
          'CONTENT_UNAVAILABLE_VIA_PROXY',
        ].includes(code)
      ) {
        this.raise_geo_restricted(undefined, ['BE']);
      } else if (
        [
          'CONTENT_AVAILABLE_ONLY_FOR_BE_RESIDENTS_AND_EXPATS',
          'CONTENT_IS_AGE_RESTRICTED',
          'CONTENT_REQUIRES_AUTHENTICATION',
        ].includes(code)
      ) {
        this.raise_login_required();
      } else {
        this.raise_no_formats(`Unable to extract formats: ${code}`);
      }
    }

    const episode = (metadata.episode as Record<string, unknown>) || {};
    const program = (episode.program as Record<string, unknown>) || {};
    const season = (episode.season as Record<string, unknown>) || {};

    return {
      id: videoId,
      display_id: displayId,
      title: episode.title ? String(episode.title) : displayId,
      description: episode.description ? String(episode.description) : undefined,
      timestamp: parse_iso8601(episode.onTimeRaw) ?? undefined,
      series: program.title ? String(program.title) : undefined,
      season: season.titleRaw ? String(season.titleRaw) : undefined,
      season_number: int_or_none(season.titleRaw) ?? undefined,
      season_id: episode.id != null ? String(episode.id) : undefined,
      episode: episode.title ? String(episode.title) : undefined,
      episode_number: int_or_none(episode.episodeNumberRaw) ?? undefined,
      episode_id: episode.id != null ? String(episode.id) : undefined,
      age_limit: parse_age_limit(str_or_none(episode.ageRaw)) ?? undefined,
      channel: episode.brand ? String(episode.brand) : undefined,
      duration:
        float_or_none(streamingInfo.duration, 1000) ??
        parse_duration(episode.durationRaw) ??
        undefined,
      thumbnail: url_or_none(streamingInfo.posterImageUrl) || undefined,
      formats,
      subtitles,
      _old_archive_ids: [
        make_archive_id('Canvas', videoId),
        make_archive_id('Ketnet', videoId),
      ],
    };
  }
}

export class DagelijkseKostIE extends VRTBaseIE {
  static IE_NAME = 'dagelijksekost';
  static IE_DESC = 'dagelijksekost.een.be';
  static _VALID_URL = /https?:\/\/dagelijksekost\.een\.be\/gerechten\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._html_search_regex(
      /data-url=(["'])(?<id>(?:(?!\1).)+)\1/,
      webpage,
      'video id',
      undefined,
      true,
      'id',
    )!;

    const data = await this._call_api(videoId, 'dako@prod', null, 'v1');
    const { formats, subtitles } = await this._extract_formats_and_subtitles(data, videoId);

    return {
      id: videoId,
      formats,
      subtitles,
      display_id: displayId,
      title:
        strip_or_none(get_element_by_class('dish-metadata__title', webpage)) ||
        this._html_search_meta('twitter:title', webpage) ||
        displayId,
      description:
        clean_html(get_element_by_class('dish-description', webpage) || '') ||
        this._html_search_meta(['description', 'twitter:description', 'og:description'], webpage) ||
        undefined,
      _old_archive_ids: [make_archive_id('Canvas', videoId)],
    };
  }
}

export class Radio1BeIE extends VRTBaseIE {
  static IE_NAME = 'radio1be';
  static _VALID_URL = /https?:\/\/radio1\.be\/(?:lees|luister\/select)\/(?<id>[\w/-]+)/;

  protected async *_extract_video_entries(
    nextJsData: Record<string, unknown>,
    displayId: string,
  ): AsyncGenerator<VideoInfo> {
    const candidates: Array<Record<string, unknown>> = [];
    if (nextJsData.mediaReference) candidates.push(nextJsData);
    for (const p of (nextJsData.paragraphs as Array<Record<string, unknown>>) || []) {
      if (p?.mediaReference) candidates.push(p);
    }
    for (const data of candidates) {
      const mediaReference = String(data.mediaReference);
      const { formats, subtitles } = await this._extract_formats_and_subtitles(
        await this._call_api(mediaReference),
        displayId,
      );
      yield {
        id: mediaReference,
        formats,
        subtitles,
        title: data.title ? String(data.title) : undefined,
        description: clean_html(data.body != null ? String(data.body) : '') || undefined,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const props = searchNextjsData(this, webpage, displayId);
    const nextJsData = traverse_obj(props, ['pageProps', 'item']) as Record<string, unknown>;
    if (!nextJsData) throw new ExtractorError('Unable to extract page data', { expected: true });

    const entries: VideoInfo[] = [];
    for await (const entry of this._extract_video_entries(nextJsData, displayId)) {
      entries.push(entry);
    }

    const playlistId = nextJsData.id != null ? String(nextJsData.id) : displayId;
    const title =
      (nextJsData.title ? String(nextJsData.title) : undefined) ||
      this._html_search_meta(['name', 'og:title', 'twitter:title'], webpage) ||
      undefined;
    const description =
      clean_html(String(nextJsData.description || nextJsData.content || '')) ||
      this._html_search_meta(
        ['description', 'og:description', 'twitter:description'],
        webpage,
      ) ||
      undefined;

    const result = this.playlist_result(entries, playlistId, title, description);
    result.display_id = displayId;
    result.thumbnail =
      this._html_search_meta(['og:image', 'twitter:image'], webpage) || undefined;
    return result;
  }
}
