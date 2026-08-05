/** Stacommu* / TheaterComplexTown* IE â€?ported from yt-dlp stacommu.py (extends WrestleUniverseBaseIE) */

import { generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, jwtDecodePayload, searchNextjsData, url_basename } from './_helpers';

abstract class WrestleUniverseBaseImpl extends InfoExtractor {
  static _NETRC_MACHINE = 'wrestleuniverse';
  static _API_HOST = 'api.wrestle-universe.com';
  static _API_PATH: string | null = null;
  static _LOGIN_QUERY: Record<string, string> = {
    key: 'AIzaSyCaRPBsDQYVDUWWBXjsTrHESi2r_F3RAdA',
  };
  static _LOGIN_HEADERS: Record<string, string> = {
    Accept: '*/*',
    'Content-Type': 'application/json',
    'X-Client-Version': 'Chrome/JsCore/9.9.4/FirebaseCore-web',
    Referer: 'https://www.wrestle-universe.com/',
    Origin: 'https://www.wrestle-universe.com',
  };

  protected _REAL_TOKEN: string | null = null;
  protected _TOKEN_EXPIRY = 0;
  protected _REFRESH_TOKEN: string | null = null;
  protected _DEVICE_ID: string | null = null;

  protected get _TOKEN(): string {
    if (!this._REAL_TOKEN || !this._TOKEN_EXPIRY) {
      const cookieToken = this._get_cookies('https://www.wrestle-universe.com/')['token'];
      if (!cookieToken && !this._REFRESH_TOKEN) this.raise_login_required();
      if (cookieToken) this._setToken(cookieToken);
    }
    if (!this._REAL_TOKEN || this._TOKEN_EXPIRY <= Math.trunc(Date.now() / 1000)) {
      if (!this._REFRESH_TOKEN) {
        throw new ExtractorError('Expired token. Refresh your cookies in browser and try again', {
          expected: true,
        });
      }
      /* refresh handled async in callers â€?sync getter returns stale token if expired */
    }
    return this._REAL_TOKEN!;
  }

  protected _setToken(value: string): void {
    this._REAL_TOKEN = value;
    const exp = jwtDecodePayload(value).exp;
    if (typeof exp !== 'number') throw new ExtractorError('There was a problem with the auth token');
    this._TOKEN_EXPIRY = exp;
  }

  protected async _realInitialize(): Promise<void> {
    if (this._DEVICE_ID) return;
    const ea = this.params.extractor_args as Record<string, { device_id?: string[] }> | undefined;
    this._DEVICE_ID = ea?.[this.IE_NAME.split(':')[0] || 'wrestleuniverse']?.device_id?.[0] || crypto.randomUUID?.() || String(Date.now());
  }

  protected async _callApi(
    videoId: string,
    param = '',
    msg = 'API',
    auth = true,
    data?: Record<string, unknown>,
    query: Record<string, string> = {},
    fatal = true,
  ): Promise<Record<string, unknown>> {
    const Ctor = this.constructor as typeof WrestleUniverseBaseImpl;
    const headers: Record<string, string> = { 'CA-CID': '' };
    let body: string | undefined;
    if (data) {
      headers['Content-Type'] = 'application/json;charset=utf-8';
      body = JSON.stringify(data);
    }
    if (auth && this._REAL_TOKEN) headers.Authorization = `Bearer ${this._REAL_TOKEN}`;
    return this._download_json(
      `https://${Ctor._API_HOST}/v1/${Ctor._API_PATH}/${videoId}${param}`,
      videoId,
      `Downloading ${msg} JSON`,
      { headers, query, data: body, fatal },
    );
  }

  protected async _callEncryptedApi(
    videoId: string,
    param: string,
    msg: string,
    data: Record<string, unknown> = {},
  ): Promise<[Record<string, unknown>, (s: string | null | undefined) => string | null]> {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pubDer = publicKey.export({ type: 'pkcs1', format: 'der' });
    const token = pubDer.toString('base64');
    const decrypt = (enc: string | null | undefined): string | null => {
      if (!enc) return null;
      try {
        return privateDecrypt(
          { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
          Uint8Array.from(atob(enc), (c) => c.charCodeAt(0)),
        ).toString('utf8');
      } catch (e) {
        throw new ExtractorError(`Could not decrypt data: ${e}`);
      }
    };
    const apiJson = await this._callApi(videoId, param, msg, true, {
      deviceId: this._DEVICE_ID,
      token,
      ...data,
    });
    return [apiJson, decrypt];
  }

  protected async _downloadMetadata(
    url: string,
    videoId: string,
    lang: string,
    propsKey: string,
  ): Promise<Record<string, unknown>> {
    let metadata = await this._callApi(videoId, '', 'metadata', false, undefined, { al: lang || 'ja' }, false);
    if (!Object.keys(metadata).length) {
      const webpage = await this._download_webpage(url, videoId);
      const nextData = searchNextjsData(this, webpage, videoId);
      metadata =
        (traverse_obj(nextData, ['pageProps', propsKey]) as Record<string, unknown>) || {};
    }
    return metadata;
  }

  protected async _getFormats(data: Record<string, unknown>, path: (string | number)[], videoId?: string): Promise<Format[]> {
    const hlsUrl = url_or_none(traverse_obj(data, path));
    if (!hlsUrl) {
      if (!data.canWatch) this.raise_login_required(undefined, undefined, 'password');
      this.raise_no_formats('No supported formats found');
    }
    const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl!, videoId || 'video', 'hls');
    return res.formats;
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('WrestleUniverseBaseIE is not a standalone extractor');
  }
}

export class WrestleUniverseBaseIE extends WrestleUniverseBaseImpl {
  static IE_NAME = 'wrestleuniversebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
}

export class StacommuBaseIE extends WrestleUniverseBaseImpl {
  static _NETRC_MACHINE = 'stacommu';
  static _API_HOST = 'api.stacommu.jp';
  static _LOGIN_QUERY = { key: 'AIzaSyCR9czxhH2eWuijEhTNWBZ5MCcOYEUTAhg' };
  static _LOGIN_HEADERS = {
    Accept: '*/*',
    'Content-Type': 'application/json',
    'X-Client-Version': 'Chrome/JsCore/9.9.4/FirebaseCore-web',
    Referer: 'https://www.stacommu.jp/',
    Origin: 'https://www.stacommu.jp',
  };

  protected async _getFormats(data: Record<string, unknown>, path: (string | number)[], videoId?: string): Promise<Format[]> {
    if (!traverse_obj(data, path) && !data.canWatch && !this._REAL_TOKEN) {
      this.raise_login_required(undefined, undefined, 'password');
    }
    return super._getFormats(data, path, videoId);
  }

  protected _extractHlsKey(
    data: Record<string, unknown>,
    path: string,
    decrypt: (s: string | null | undefined) => string | null,
  ): { hls_aes?: { key?: string; iv?: string } } {
    const encryptionData = traverse_obj(data, [path]) as Record<string, unknown> | undefined;
    if (int_or_none(encryptionData?.encryptType) === 0) return {};
    const key = decrypt(traverse_obj(encryptionData, ['key']) as string | undefined);
    if (!key) return {};
    return {
      hls_aes: {
        key,
        iv: decrypt(traverse_obj(encryptionData, ['iv']) as string | undefined) || undefined,
      },
    };
  }

  protected async _extractVod(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._downloadMetadata(url, videoId, 'ja', 'dehydratedState.queries.0.state.data');
    const [hlsInfo, decrypt] = await this._callEncryptedApi(videoId, ':watch', 'stream information', {
      method: 1,
    });
    return {
      id: videoId,
      formats: await this._getFormats(hlsInfo, ['protocolHls', 'url'], videoId),
      ...this._extractHlsKey(hlsInfo, 'protocolHls', decrypt),
      title: String(videoInfo.displayName || videoId),
      description: videoInfo.description != null ? String(videoInfo.description) : undefined,
      timestamp: int_or_none(videoInfo.watchStartTime) ?? undefined,
      thumbnail: url_or_none(videoInfo.keyVisualUrl) || undefined,
      cast: ((videoInfo.casts as Record<string, unknown>[]) || [])
        .map((c) => String(c.displayName || ''))
        .filter(Boolean),
      duration: int_or_none(videoInfo.duration) ?? undefined,
    };
  }

  protected async _extractPpv(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoInfo = await this._callApi(videoId, '', 'video information', false, undefined, { al: 'ja' }, false);
    const [hlsInfo, decrypt] = await this._callEncryptedApi(videoId, ':watchArchive', 'stream information', {
      method: 1,
    });
    const formats = await this._getFormats(hlsInfo, ['hls', 'urls'], videoId);
    for (const f of formats) {
      if (f.tbr) f.tbr = Math.trunc(f.tbr / 2.5);
      const base = url_basename(f.url || '').split('.')[0] || '';
      f.format_id = base;
      const manifestBase = url_basename(f.manifest_url || f.url || '').split('.')[0] || '';
      if (!base.startsWith(manifestBase)) f.preference = -10;
    }
    return {
      id: videoId,
      formats,
      ...this._extractHlsKey(hlsInfo, 'hls', decrypt),
      title: String(videoInfo.displayName || videoId),
      timestamp: int_or_none(videoInfo.startTime) ?? undefined,
      thumbnail: url_or_none(videoInfo.keyVisualUrl) || undefined,
      duration: int_or_none(videoInfo.duration) ?? undefined,
    };
  }
}

export class StacommuVODIE extends StacommuBaseIE {
  static IE_NAME = 'stacommu:vod';
  static _VALID_URL = /https?:\/\/www\.stacommu\.jp\/(?:en\/)?videos\/episodes\/(?<id>[\da-zA-Z]+)/;
  static _API_PATH = 'videoEpisodes';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractVod(url);
  }
}

export class StacommuLiveIE extends StacommuBaseIE {
  static IE_NAME = 'stacommu:live';
  static _VALID_URL = /https?:\/\/www\.stacommu\.jp\/(?:en\/)?live\/(?<id>[\da-zA-Z]+)/;
  static _API_PATH = 'events';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPpv(url);
  }
}

export class TheaterComplexTownBaseIE extends StacommuBaseIE {
  static _NETRC_MACHINE = 'theatercomplextown';
  static _API_HOST = 'api.theater-complex.town';
  static _LOGIN_QUERY = { key: 'AIzaSyAgNCqToaIz4a062EeIrkhI_xetVfAOrfc' };
  static _LOGIN_HEADERS = {
    Accept: '*/*',
    'Content-Type': 'application/json',
    'X-Client-Version': 'Chrome/JsCore/9.23.0/FirebaseCore-web',
    Referer: 'https://www.theater-complex.town/',
    Origin: 'https://www.theater-complex.town',
  };
}

export class TheaterComplexTownVODIE extends TheaterComplexTownBaseIE {
  static IE_NAME = 'theatercomplextown:vod';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?theater-complex\.town\/(?:(?:en|ja)\/)?videos\/episodes\/(?<id>\w+)/;
  static _API_PATH = 'videoEpisodes';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractVod(url);
  }
}

export class TheaterComplexTownPPVIE extends TheaterComplexTownBaseIE {
  static IE_NAME = 'theatercomplextown:ppv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?theater-complex\.town\/(?:(?:en|ja)\/)?(?:ppv|live)\/(?<id>\w+)/;
  static _API_PATH = 'events';

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPpv(url);
  }
}
