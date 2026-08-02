/**
 * NetEase Music family — ported from yt-dlp neteasemusic.py (EAPI main path; VIP tier edges simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, unified_strdate, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

const LEVELS = ['standard', 'higher', 'exhigh', 'lossless', 'hires', 'jyeffect', 'jymaster', 'sky'] as const;

async function pkcs7Pad(data: Uint8Array, blockSize = 16): Promise<Uint8Array> {
  const pad = blockSize - (data.length % blockSize);
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}

async function aesEcbEncrypt(data: number[], key: number[]): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    { name: 'AES-ECB' },
    false,
    ['encrypt'],
  );
  const padded = await pkcs7Pad(new Uint8Array(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-ECB' }, cryptoKey, padded);
  return new Uint8Array(encrypted);
}

export class NetEaseMusicBaseIE extends InfoExtractor {
  static IE_NAME = 'neteasemusicbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _API_BASE = 'http://music.163.com/api/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NetEaseMusicBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _createEapiCipher(apiPath: string, queryBody: Record<string, unknown>, cookies: Record<string, string>): Promise<string> {
    const requestText = JSON.stringify({ ...queryBody, header: cookies });
    const message = `nobody${apiPath}use${requestText}md5forencrypt`;
    const msgDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message)).then((buf) =>
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32),
    );
    const payload = `${apiPath}-36cd479b6b5-${requestText}-36cd479b6b5-${msgDigest}`;
    const encrypted = await aesEcbEncrypt([...new TextEncoder().encode(payload)], [...'e82ckenh8dichen8'].map((c) => c.charCodeAt(0)));
    return `params=${[...encrypted].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  protected async _downloadEapiJson(
    path: string,
    videoId: string,
    queryBody: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    const cookieStore = await this._get_cookies(this._API_BASE);
    const cookies: Record<string, string> = {
      osver: 'undefined',
      deviceId: 'undefined',
      appver: '8.0.0',
      versioncode: '140',
      mobilename: 'undefined',
      buildver: '1623435496',
      resolution: '1920x1080',
      __csrf: '',
      os: 'pc',
      channel: 'undefined',
      requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      ...(cookieStore.MUSIC_U ? { MUSIC_U: cookieStore.MUSIC_U } : {}),
    };
    const body = await this._createEapiCipher(`/api${path}`, queryBody, cookies);
    return this._download_json<Record<string, unknown>>(
      urljoin('https://interface3.music.163.com/', `/eapi${path}`),
      videoId,
      undefined,
      {
        method: 'POST',
        data: body,
        headers: {
          Referer: 'https://music.163.com',
          Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
          ...headers,
        },
      },
    );
  }

  protected async _callPlayerApi(songId: string, level: string): Promise<Record<string, unknown>> {
    return this._downloadEapiJson('/song/enhance/player/url/v1', songId, {
      ids: `[${songId}]`,
      level,
      encodeType: 'flac',
    });
  }

  protected async _extractFormats(info: Record<string, unknown>): Promise<Format[]> {
    const formats: Format[] = [];
    const songId = String(info.id ?? '');
    for (const level of LEVELS) {
      const resp = await this._callPlayerApi(songId, level);
      const dataList = (resp.data as Array<Record<string, unknown>>) || [];
      const song = dataList.find((v) => url_or_none(v.url)) as Record<string, unknown> | undefined;
      if (!song) break;
      const actualLevel = song.level as string | undefined;
      if (actualLevel && actualLevel !== level) {
        if (level === 'lossless' || level === 'jymaster') break;
        continue;
      }
      formats.push({
        url: String(song.url),
        format_id: level,
        vcodec: 'none',
        ext: str_or_none(song.type) || undefined,
        abr: int_or_none(song.br, 1000) ?? undefined,
        filesize: int_or_none(song.size) ?? undefined,
      });
      if (!actualLevel) break;
    }
    if (!formats.length) this.raise_geo_restricted('No media links found; possibly due to geo restriction', ['CN']);
    return formats;
  }

  protected async _queryApi(endpoint: string, videoId: string, note: string): Promise<Record<string, unknown>> {
    const result = await this._download_json<Record<string, unknown>>(
      `${this._API_BASE}${endpoint}`,
      videoId,
      note,
      { headers: { Referer: this._API_BASE } },
    );
    const code = int_or_none(result.code);
    const message = str_or_none(result.message) || '';
    if (code === -462) this.raise_login_required(`Login required to download: ${message}`);
    if (code !== 200) throw new ExtractorError(`Failed to get meta info: ${code} ${message}`);
    return result;
  }

  protected *_getEntries(
    songsData: unknown,
    entryKeys?: string[],
    idKey = 'id',
    nameKey = 'name',
  ): Generator<VideoInfo> {
    let list: unknown = songsData;
    for (const key of entryKeys || []) {
      list = (list as Record<string, unknown>)?.[key];
    }
    for (const song of (list as Array<Record<string, unknown>>) || []) {
      if (int_or_none(song[idKey]) == null) continue;
      const songId = String(song[idKey]);
      yield this.url_result(
        `http://music.163.com/#/song?id=${songId}`,
        'NetEaseMusic',
        songId,
        str_or_none(song[nameKey]) || undefined,
      ) as VideoInfo;
    }
  }
}

export class NetEaseMusicIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:song';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?song\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const songId = this._match_id(url);
    const result = await this._queryApi(`song/detail?ids=[${songId}]`, songId, 'Downloading song info');
    const song = traverse_obj(result, ['songs', 0]) as Record<string, unknown>;
    if (!song) throw new ExtractorError('Unable to extract song data');

    const info: VideoInfo = {
      id: songId,
      title: [song.name, song.alias].filter(Boolean).join(' - ') || songId,
      creators: ((song.ar as Array<Record<string, unknown>>) || []).map((a) => String(a.name ?? '')).filter(Boolean),
      timestamp: int_or_none(song.publishTime) ?? undefined,
      upload_date: unified_strdate(song.publishTime) ?? undefined,
      description: str_or_none(traverse_obj(song, ['alia', 0])) ?? undefined,
      duration: int_or_none(song.dt, 1000) ?? undefined,
      thumbnail: url_or_none(traverse_obj(song, ['al', 'picUrl'])) ?? undefined,
      album: traverse_obj(song, ['al', 'name']) as string | undefined,
      album_artist: traverse_obj(song, ['al', 'artist', 'name']) as string | undefined,
      track: song.name as string | undefined,
      track_number: int_or_none(song.no) ?? undefined,
      disc_number: int_or_none(song.cd) ?? undefined,
      formats: await this._extractFormats({ id: songId }),
    };
    return info;
  }
}

export class NetEaseMusicAlbumIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:album';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?album\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumId = this._match_id(url);
    const result = await this._queryApi(`album?id=${albumId}`, albumId, 'Downloading album info');
    const entries = [...this._getEntries(result, ['songs'])];
    return this.playlist_result(entries, albumId, traverse_obj(result, ['album', 'name']) as string | undefined);
  }
}

export class NetEaseMusicSingerIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:singer';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?artist\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const singerId = this._match_id(url);
    const result = await this._queryApi(`artist?id=${singerId}`, singerId, 'Downloading artist info');
    const entries = [...this._getEntries(result, ['hotSongs'])];
    return this.playlist_result(entries, singerId, traverse_obj(result, ['artist', 'name']) as string | undefined);
  }
}

export class NetEaseMusicListIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:playlist';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?playlist\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const result = await this._queryApi(`playlist/detail?id=${listId}`, listId, 'Downloading playlist info');
    const entries = [...this._getEntries(result, ['playlist', 'tracks'])];
    return this.playlist_result(entries, listId, traverse_obj(result, ['playlist', 'name']) as string | undefined);
  }
}

export class NetEaseMusicMvIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:mv';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?mv\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mvId = this._match_id(url);
    const result = await this._queryApi(`mv?id=${mvId}`, mvId, 'Downloading MV info');
    const data = (result.data as Record<string, unknown>) || {};
    const brs = (data.brs as Record<string, string>) || {};
    const formats: Format[] = Object.entries(brs).map(([br, u]) => ({
      format_id: br,
      url: u,
      ext: 'mp4',
      height: int_or_none(br.replace(/\D/g, '')) ?? undefined,
    }));
    return {
      id: mvId,
      title: data.name as string | undefined,
      description: data.desc as string | undefined,
      duration: int_or_none(data.duration, 1000) ?? undefined,
      timestamp: int_or_none(data.publishTime) ?? undefined,
      thumbnail: url_or_none(data.cover) ?? undefined,
      formats,
    };
  }
}

export class NetEaseMusicProgramIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:program';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?(?:program|djradio\/program)\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programId = this._match_id(url);
    const result = await this._queryApi(`dj/program/detail?id=${programId}`, programId, 'Downloading program info');
    const program = (result.program as Record<string, unknown>) || {};
    const mainSong = (program.mainSong as Record<string, unknown>) || {};
    return {
      id: programId,
      title: program.name as string | undefined,
      description: program.description as string | undefined,
      duration: int_or_none(program.duration, 1000) ?? undefined,
      timestamp: int_or_none(program.createTime) ?? undefined,
      thumbnail: url_or_none(program.coverUrl) ?? undefined,
      formats: await this._extractFormats({ id: String(mainSong.id ?? programId) }),
    };
  }
}

export class NetEaseMusicDjRadioIE extends NetEaseMusicBaseIE {
  static IE_NAME = 'netease:djradio';
  static _VALID_URL =
    /https?:\/\/(?:y\.)?music\.163\.com\/(?:[#m]\/)?djradio\?.*?\bid=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const radioId = this._match_id(url);
    const result = await this._queryApi(`dj/program?radioId=${radioId}&limit=100`, radioId, 'Downloading DJ radio');
    const entries = [...this._getEntries(result, ['programs'], 'id', 'name')];
    return this.playlist_result(entries, radioId);
  }
}
