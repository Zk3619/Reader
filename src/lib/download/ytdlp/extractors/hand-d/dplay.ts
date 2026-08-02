/**
 * DPlay / Discovery+ family — ported from yt-dlp dplay.py
 *
 * Pragmatic notes vs upstream:
 * - Cookie jar / login flows are best-effort; premium-only content raises expected errors.
 * - HTTP status-aware error parsing is approximated from JSON error payloads when present.
 * - Show playlist extractors enumerate seasons/episodes via the disco CMS routes API.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  remove_start,
  str_or_none,
  try_get,
  unified_timestamp,
} from '../../utils';

const PATH_REGEX = '/(?<id>[^/]+/[^/?#]+)';

type DiscoApiParams = {
  disco_host: string;
  realm: string;
  country: string;
  domain?: string;
};

type StreamingEntry = { type?: string; url?: string };

function stripOrNone(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function normalizeStreaming(streaming: unknown): StreamingEntry[] {
  if (Array.isArray(streaming)) {
    return streaming
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((entry) => ({
        type: str_or_none(entry.type) ?? undefined,
        url: str_or_none(entry.url) ?? undefined,
      }));
  }
  if (streaming && typeof streaming === 'object') {
    return Object.entries(streaming as Record<string, unknown>).map(([type, val]) => {
      const dict = val && typeof val === 'object' ? (val as Record<string, unknown>) : {};
      return { type, url: str_or_none(dict.url) ?? undefined };
    });
  }
  return [];
}

function randomDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export class DPlayBaseIE extends InfoExtractor {
  static IE_NAME = 'dplaybase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _PATH_REGEX = PATH_REGEX;

  private static _authTokenCache = new Map<string, string>();

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DPlayBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getAuth(
    discoBase: string,
    displayId: string | null,
    realm: string,
    needsDeviceId = true,
  ): Promise<string> {
    const key = `${discoBase}|${realm}`;
    const cookies = this._get_cookies(discoBase);
    let token = cookies.st || DPlayBaseIE._authTokenCache.get(key);

    if (!token) {
      const query: Record<string, string> = { realm };
      if (needsDeviceId) query.deviceId = randomDeviceId();
      try {
        const resp = await this._download_json<{ data?: { attributes?: { token?: string } } }>(
          `${discoBase}token`,
          displayId || undefined,
          'Downloading token',
          { query },
        );
        token = resp.data?.attributes?.token;
      } catch (e) {
        throw new ExtractorError(
          'This video is only available for registered users. You may want to use --cookies.',
          { expected: true, cause: e },
        );
      }
      if (!token) {
        throw new ExtractorError(
          'This video is only available for registered users. You may want to use --cookies.',
          { expected: true },
        );
      }
      if (!cookies.st) DPlayBaseIE._authTokenCache.set(key, token);
    }

    return `Bearer ${token}`;
  }

  protected _processDiscoErrors(body: string, geoCountries: string[]): never {
    let info: { errors?: Array<{ code?: string; detail?: string }> } = {};
    try {
      info = JSON.parse(body);
    } catch {
      throw new ExtractorError(body || 'Disco API error', { expected: true });
    }
    const error = info.errors?.[0];
    const errorCode = error?.code;
    if (errorCode === 'access.denied.geoblocked') {
      this.raise_geo_restricted(undefined, geoCountries);
    }
    if (errorCode === 'access.denied.missingpackage' || errorCode === 'invalid.token') {
      throw new ExtractorError(
        'This video is only available for registered users. You may want to use --cookies.',
        { expected: true },
      );
    }
    throw new ExtractorError(error?.detail || 'Disco API error', { expected: true });
  }

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers.Authorization = await this._getAuth(discoBase, displayId, realm, false);
  }

  protected async _downloadVideoPlaybackInfo(
    discoBase: string,
    videoId: string,
    headers: Record<string, string>,
  ): Promise<StreamingEntry[]> {
    const resp = await this._download_json<{ data?: { attributes?: { streaming?: unknown } } }>(
      `${discoBase}playback/videoPlaybackInfo/${videoId}`,
      videoId,
      undefined,
      { headers },
    );
    return normalizeStreaming(resp.data?.attributes?.streaming);
  }

  protected async _getDiscoApiInfo(
    url: string,
    displayId: string,
    discoHost: string,
    realm: string,
    country: string,
    domain = '',
  ): Promise<VideoInfo> {
    const geoCountry =
      str_or_none(this.params.geo_bypass_country) || country;
    const geoCountries = [geoCountry.toUpperCase()];
    const discoBase = `https://${discoHost}/`;
    const headers: Record<string, string> = { Referer: url };
    await this._updateDiscoApiHeaders(headers, discoBase, displayId, realm);

    let video: { data?: { id?: string; attributes?: Record<string, unknown> }; included?: unknown[] };
    try {
      video = await this._download_json(
        `${discoBase}content/videos/${displayId}`,
        displayId,
        undefined,
        {
          headers,
          query: {
            'fields[channel]': 'name',
            'fields[image]': 'height,src,width',
            'fields[show]': 'name',
            'fields[tag]': 'name',
            'fields[video]': 'description,episodeNumber,name,publishStart,seasonNumber,videoDuration',
            include: 'images,primaryChannel,show,tags',
          },
        },
      );
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('400')) this._processDiscoErrors(msg, geoCountries);
      throw e;
    }

    const videoId = String(video.data?.id ?? displayId);
    const info = (video.data?.attributes || {}) as Record<string, unknown>;
    const title = stripOrNone(info.name) || displayId;

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    try {
      const streaming = await this._downloadVideoPlaybackInfo(discoBase, videoId, headers);
      for (const formatDict of streaming) {
        const formatUrl = formatDict.url;
        if (!formatUrl) continue;
        const formatId = formatDict.type;
        const ext = determine_ext(formatUrl);
        if (formatId === 'dash' || ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(formatUrl, displayId, 'dash', undefined, false)));
        } else if (formatId === 'hls' || ext === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              formatUrl,
              displayId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else {
          formats.push({ url: formatUrl, format_id: formatId || 'http' });
        }
      }
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('403')) this._processDiscoErrors(msg, geoCountries);
      throw e;
    }

    let creator: string | undefined;
    let series: string | undefined;
    const tags: string[] = [];
    const thumbnails: Thumbnail[] = [];
    const included = Array.isArray(video.included) ? video.included : [];
    for (const e of included) {
      if (!e || typeof e !== 'object') continue;
      const entry = e as Record<string, unknown>;
      const attributes = entry.attributes as Record<string, unknown> | undefined;
      if (!attributes) continue;
      const eType = entry.type;
      if (eType === 'channel') {
        creator = str_or_none(attributes.name) ?? undefined;
      } else if (eType === 'image') {
        const src = str_or_none(attributes.src);
        if (src) {
          thumbnails.push({
            url: src,
            width: int_or_none(attributes.width) ?? undefined,
            height: int_or_none(attributes.height) ?? undefined,
          });
        }
      } else if (eType === 'show') {
        series = str_or_none(attributes.name) ?? undefined;
      } else if (eType === 'tag') {
        const name = str_or_none(attributes.name);
        if (name) tags.push(name);
      }
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: stripOrNone(info.description),
      duration: float_or_none(info.videoDuration, 1000) ?? undefined,
      timestamp: unified_timestamp(info.publishStart) ?? undefined,
      series,
      season_number: int_or_none(info.seasonNumber) ?? undefined,
      episode_number: int_or_none(info.episodeNumber) ?? undefined,
      creator,
      tags,
      thumbnails,
      formats,
      subtitles,
      http_headers: { referer: domain },
    };
  }
}

export class DPlayIE extends DPlayBaseIE {
  static IE_NAME = 'dplay';
  static _VALID_URL = new RegExp(
    String.raw`https?://` +
      String.raw`(?<domain>(?:www\.)?(?<host>d(?:` +
      String.raw`play\.(?<country>dk|fi|jp|se|no)|` +
      String.raw`iscoveryplus\.(?<plus_country>dk|es|fi|it|se|no))|` +
      String.raw`(?<subdomain_country>es|it)\.dplay\.com))/[^/]+` +
      PATH_REGEX,
    'i',
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    let domain = remove_start(m.groups!.domain, 'www.') || m.groups!.domain!;
    const country =
      m.groups!.country || m.groups!.subdomain_country || m.groups!.plus_country || '';
    const host = domain.startsWith('d') ? `disco-api.${domain}` : 'eu2-prod.disco-api.com';
    return this._getDiscoApiInfo(url, displayId, host, `dplay${country}`, country, domain);
  }
}

export class DiscoveryPlusBaseIE extends DPlayBaseIE {
  static IE_NAME = 'discoveryplusbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _DISCO_CLIENT_VER = '27.43.0';
  static _PRODUCT = '';
  static _DISCO_API_PARAMS: DiscoApiParams | null = null;

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    const Ctor = this.constructor as typeof DiscoveryPlusBaseIE;
    headers['x-disco-params'] = `realm=${realm},siteLookupKey=${Ctor._PRODUCT}`;
    headers['x-disco-client'] = `WEB:UNKNOWN:${Ctor._PRODUCT}:${Ctor._DISCO_CLIENT_VER}`;
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }

  protected async _downloadVideoPlaybackInfo(
    discoBase: string,
    videoId: string,
    headers: Record<string, string>,
  ): Promise<StreamingEntry[]> {
    const resp = await this._download_json<{ data?: { attributes?: { streaming?: unknown } } }>(
      `${discoBase}playback/v3/videoPlaybackInfo`,
      videoId,
      undefined,
      {
        headers,
        method: 'POST',
        data: JSON.stringify({
          deviceInfo: { adBlocker: false, drmSupported: false },
          videoId,
          wisteriaProperties: {},
        }),
      },
    );
    return normalizeStreaming(resp.data?.attributes?.streaming);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const Ctor = this.constructor as typeof DiscoveryPlusBaseIE;
    const params = Ctor._DISCO_API_PARAMS;
    if (!params) {
      throw new ExtractorError(`${Ctor.IE_NAME} missing disco API params`, { expected: true });
    }
    return this._getDiscoApiInfo(
      url,
      this._match_id(url),
      params.disco_host,
      params.realm,
      params.country,
      params.domain || '',
    );
  }
}

export class HGTVDeIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'hgtvde';
  static _VALID_URL = new RegExp(String.raw`https?://de\.hgtv\.com/sendungen${PATH_REGEX}`, 'i');
  static _PRODUCT = 'hgtv';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'eu1-prod.disco-api.com',
    realm: 'hgtv',
    country: 'de',
  };

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm}`;
    headers['x-disco-client'] = 'Alps:HyogaPlayer:0.0.0';
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }
}

export class GoDiscoveryIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'godiscovery';
  static _VALID_URL = new RegExp(String.raw`https?://(?:go\.)?discovery\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'dsc';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.go.discovery.com',
    realm: 'go',
    country: 'us',
  };
}

export class TravelChannelIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'travelchannel';
  static _VALID_URL = new RegExp(String.raw`https?://(?:watch\.)?travelchannel\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'trav';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.watch.travelchannel.com',
    realm: 'go',
    country: 'us',
  };
}

export class CookingChannelIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'cookingchannel';
  static _VALID_URL = new RegExp(String.raw`https?://(?:watch\.)?cookingchanneltv\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'cook';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.watch.cookingchanneltv.com',
    realm: 'go',
    country: 'us',
  };
}

export class HGTVUsaIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'hgtvusa';
  static _VALID_URL = new RegExp(String.raw`https?://(?:watch\.)?hgtv\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'hgtv';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.watch.hgtv.com',
    realm: 'go',
    country: 'us',
  };
}

export class FoodNetworkIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'foodnetwork';
  static _VALID_URL = new RegExp(String.raw`https?://(?:watch\.)?foodnetwork\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'food';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.watch.foodnetwork.com',
    realm: 'go',
    country: 'us',
  };
}

export class DestinationAmericaIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'destinationamerica';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?destinationamerica\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'dam';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.destinationamerica.com',
    realm: 'go',
    country: 'us',
  };
}

export class InvestigationDiscoveryIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'investigationdiscovery';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:www\.)?investigationdiscovery\.com/video${PATH_REGEX}`,
    'i',
  );
  static _PRODUCT = 'ids';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.investigationdiscovery.com',
    realm: 'go',
    country: 'us',
  };
}

export class AmHistoryChannelIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'amhistorychannel';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?ahctv\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'ahc';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.ahctv.com',
    realm: 'go',
    country: 'us',
  };
}

export class ScienceChannelIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'sciencechannel';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?sciencechannel\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'sci';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.sciencechannel.com',
    realm: 'go',
    country: 'us',
  };
}

export class DiscoveryLifeIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'discoverylife';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?discoverylife\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'dlf';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.discoverylife.com',
    realm: 'go',
    country: 'us',
  };
}

export class AnimalPlanetIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'animalplanet';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?animalplanet\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'apl';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.animalplanet.com',
    realm: 'go',
    country: 'us',
  };
}

export class TLCIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'tlc';
  static _VALID_URL = new RegExp(String.raw`https?://(?:go\.)?tlc\.com/video${PATH_REGEX}`, 'i');
  static _PRODUCT = 'tlc';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'us1-prod-direct.tlc.com',
    realm: 'go',
    country: 'us',
  };
}

export class DiscoveryPlusIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'discoveryplus';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:www\.)?discoveryplus\.com/(?!it/)(?:(?<country>[a-z]{2})/)?video(?:/sport|/olympics)?${PATH_REGEX}`,
    'i',
  );

  private _runtimeProduct = 'dplus_us';

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm},siteLookupKey=${this._runtimeProduct}`;
    headers['x-disco-client'] = `WEB:UNKNOWN:dplus_us:${DiscoveryPlusBaseIE._DISCO_CLIENT_VER}`;
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const country = m.groups!.country || 'us';

    this._runtimeProduct = `dplus_${country}`;
    const params: DiscoApiParams = ['br', 'ca', 'us'].includes(country)
      ? {
          disco_host: 'us1-prod-direct.discoveryplus.com',
          realm: 'go',
          country,
        }
      : {
          disco_host: 'eu1-prod-direct.discoveryplus.com',
          realm: 'dplay',
          country,
        };

    return this._getDiscoApiInfo(url, videoId, params.disco_host, params.realm, params.country);
  }
}

export class DiscoveryPlusIndiaIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'discoveryplusindia';
  static _VALID_URL = new RegExp(String.raw`https?://(?:www\.)?discoveryplus\.in/videos?${PATH_REGEX}`, 'i');
  static _PRODUCT = 'dplus-india';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'ap2-prod-direct.discoveryplus.in',
    realm: 'dplusindia',
    country: 'in',
    domain: 'https://www.discoveryplus.in/',
  };

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm}`;
    headers['x-disco-client'] = `WEB:UNKNOWN:${DiscoveryPlusIndiaIE._PRODUCT}:17.0.0`;
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }
}

export class DiscoveryNetworksDeIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'discoverynetworksde';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<domain>(?:tlc|dmax)\.de)\/(?:programme|show|sendungen)\/(?<programme>[^/?#]+)\/(?:video\/)?(?<alternate_id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const programme = m.groups!.programme!;
    const alternateId = m.groups!.alternate_id!;
    const displayId = `${programme}/${alternateId}`;

    const meta = await this._download_json<Record<string, unknown>>(
      `https://de-api.loma-cms.com/feloma/videos/${alternateId}/`,
      displayId,
      undefined,
      {
        fatal: false,
        query: {
          environment: domain.split('.')[0]!,
          v: '2',
          'filter[show.slug]': programme,
        },
      },
    );

    const uid = str_or_none(meta.uid);
    const videoId = uid ? uid.slice(-7) : displayId;

    const discoApiInfo = await this._getDiscoApiInfo(
      url,
      videoId,
      'eu1-prod.disco-api.com',
      domain.replace('.', ''),
      'DE',
    );
    discoApiInfo.display_id = displayId;
    const taxonomies = Array.isArray(meta.taxonomies)
      ? (meta.taxonomies as Record<string, unknown>[])
      : [];
    const categories = taxonomies
      .filter((item) => item.category === 'genre')
      .map((item) => stripOrNone(item.title))
      .filter((t): t is string => !!t);
    if (categories.length) discoApiInfo.categories = categories;
    return discoApiInfo;
  }

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm}`;
    headers['x-disco-client'] = 'Alps:HyogaPlayer:0.0.0';
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }
}

export class DiscoveryPlusShowBaseIE extends DPlayBaseIE {
  static IE_NAME = 'discoveryplusshowbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected static _BASE_API = '';
  protected static _DOMAIN = '';
  protected static _X_CLIENT = '';
  protected static _REALM = '';
  protected static _SHOW_STR = '';
  protected static _INDEX = 0;
  protected static _VIDEO_IE: typeof InfoExtractor = InfoExtractor;

  protected async _entries(showName: string): Promise<VideoInfo[]> {
    const Ctor = this.constructor as typeof DiscoveryPlusShowBaseIE;
    const headers: Record<string, string> = {
      'x-disco-client': Ctor._X_CLIENT,
      'x-disco-params': `realm=${Ctor._REALM}`,
      referer: Ctor._DOMAIN,
      Authentication: await this._getAuth(Ctor._BASE_API, null, Ctor._REALM),
    };

    const showJson = await this._download_json<{
      included?: Record<string, { attributes?: { component?: Record<string, unknown> } }>;
    }>(
      `${Ctor._BASE_API}cms/routes/${Ctor._SHOW_STR}/${showName}?include=default`,
      showName,
      undefined,
      { headers },
    );

    const component = showJson.included?.[String(Ctor._INDEX)]?.attributes?.component;
    const mandatoryParams = str_or_none(component?.mandatoryParams) || '';
    const showId = mandatoryParams.split('=').pop() || showName;
    const filters = (component?.filters as Array<{ options?: Array<{ id?: string | number }> }>) || [];
    const seasons = filters[0]?.options || [];

    const entries: VideoInfo[] = [];
    const seasonUrlTemplate =
      `${Ctor._BASE_API}content/videos?sort=episodeNumber&filter[seasonNumber]={season}&filter[show.id]={show}&page[size]=100&page[number]={page}`;

    for (const season of seasons) {
      const seasonId = season.id;
      if (seasonId == null) continue;
      let totalPages = 1;
      let pageNum = 0;
      while (pageNum < totalPages) {
        const seasonJson = await this._download_json<{
          meta?: { totalPages?: number };
          data?: Array<{ id?: string; attributes?: { path?: string } }>;
        }>(
          seasonUrlTemplate
            .replace('{season}', String(seasonId))
            .replace('{show}', showId)
            .replace('{page}', String(pageNum + 1)),
          showName,
          pageNum ? `Downloading season ${seasonId} JSON metadata page ${pageNum}` : `Downloading season ${seasonId} JSON metadata`,
          { headers },
        );
        if (pageNum === 0) {
          totalPages = try_get(seasonJson, (x) => x.meta?.totalPages, (v) => typeof v === 'number') || 1;
        }
        const episodes = seasonJson.data || [];
        for (const episode of episodes) {
          const videoPath = str_or_none(episode.attributes?.path);
          if (!videoPath) continue;
          entries.push(
            this.url_result(
              `${Ctor._DOMAIN}videos/${videoPath}`,
              (Ctor._VIDEO_IE as typeof InfoExtractor).IE_NAME,
              str_or_none(episode.id) || videoPath,
            ),
          );
        }
        pageNum += 1;
      }
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showName = this._match_valid_url(url)!.groups!.show_name!;
    return this.playlist_result(await this._entries(showName), showName);
  }
}

export class DiscoveryPlusItalyIE extends DiscoveryPlusBaseIE {
  static IE_NAME = 'discoveryplusitaly';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:www\.)?discoveryplus\.com/it/video(?:/sport|/olympics)?${PATH_REGEX}`,
    'i',
  );
  static _PRODUCT = 'dplus_it';
  static _DISCO_API_PARAMS: DiscoApiParams = {
    disco_host: 'eu1-prod-direct.discoveryplus.com',
    realm: 'dplay',
    country: 'it',
  };

  protected async _updateDiscoApiHeaders(
    headers: Record<string, string>,
    discoBase: string,
    displayId: string,
    realm: string,
  ): Promise<void> {
    headers['x-disco-params'] = `realm=${realm},siteLookupKey=${DiscoveryPlusItalyIE._PRODUCT}`;
    headers['x-disco-client'] = `WEB:UNKNOWN:dplus_us:${DiscoveryPlusBaseIE._DISCO_CLIENT_VER}`;
    headers.Authorization = await this._getAuth(discoBase, displayId, realm);
  }
}

export class DiscoveryPlusItalyShowIE extends DiscoveryPlusShowBaseIE {
  static IE_NAME = 'discoveryplusitalyshow';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?discoveryplus\.it\/programmi\/(?<show_name>[^/]+)\/?(?:[?#]|$)/i;
  protected static _BASE_API = 'https://disco-api.discoveryplus.it/';
  protected static _DOMAIN = 'https://www.discoveryplus.it/';
  protected static _X_CLIENT = 'WEB:UNKNOWN:dplay-client:2.6.0';
  protected static _REALM = 'dplayit';
  protected static _SHOW_STR = 'programmi';
  protected static _INDEX = 1;
  protected static _VIDEO_IE = DPlayIE;
}

export class DiscoveryPlusIndiaShowIE extends DiscoveryPlusShowBaseIE {
  static IE_NAME = 'discoveryplusindiashow';
  static _VALID_URL = /https?:\/\/(?:www\.)?discoveryplus\.in\/show\/(?<show_name>[^/]+)\/?(?:[?#]|$)/i;
  protected static _BASE_API = 'https://ap2-prod-direct.discoveryplus.in/';
  protected static _DOMAIN = 'https://www.discoveryplus.in/';
  protected static _X_CLIENT = 'WEB:UNKNOWN:dplus-india:prod';
  protected static _REALM = 'dplusindia';
  protected static _SHOW_STR = 'show';
  protected static _INDEX = 4;
  protected static _VIDEO_IE = DiscoveryPlusIndiaIE;
}
