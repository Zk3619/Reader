/** Radiko* — ported from yt-dlp radiko.py (main paths, simplified auth) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { join_nonempty, update_url_query } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

const FULL_KEY_FALLBACK = 'bcd151073c03b352e1ef2fd66c32209da9ca0afa';

function b64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export class RadikoBaseIE extends InfoExtractor {
  static IE_NAME = 'RadikoBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _GEO_BYPASS = false;
  protected _fullKey: Uint8Array | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RadikoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractFullKey(): Promise<Uint8Array> {
    if (this._fullKey) return this._fullKey;
    const jscode = await this._download_webpage('https://radiko.jp/apps/js/playerCommon.js', 'radiko', 'Downloading player js code');
    const m = jscode.match(/RadikoJSPlayer\([^,]*,\s*(['"])pc_html5\1,\s*(['"])(?<fullkey>[0-9a-f]+)\2,/);
    const hex = m?.groups?.fullkey || FULL_KEY_FALLBACK;
    this._fullKey = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    return this._fullKey;
  }

  protected async _negotiateToken(): Promise<[string, string]> {
    const auth1Resp = await this._download_webpage('https://radiko.jp/v2/api/auth1', 'radiko', 'Downloading authentication page', {
      headers: {
        'x-radiko-app': 'pc_html5',
        'x-radiko-app-version': '0.0.1',
        'x-radiko-device': 'pc',
        'x-radiko-user': 'dummy_user',
      },
    });
    const authToken = this._search_regex(/X-Radiko-AuthToken:\s*(\S+)/i, auth1Resp, 'auth token', null, false) || '';
    const kl = Number(this._search_regex(/X-Radiko-KeyLength:\s*(\d+)/i, auth1Resp, 'key length', null, false) || 0);
    const ko = Number(this._search_regex(/X-Radiko-KeyOffset:\s*(\d+)/i, auth1Resp, 'key offset', null, false) || 0);
    const fullKey = await this._extractFullKey();
    const partialKey = b64Encode(fullKey.slice(ko, ko + kl));
    const areaId = (
      await this._download_webpage('https://radiko.jp/v2/api/auth2', 'radiko', 'Authenticating', {
        headers: {
          'x-radiko-device': 'pc',
          'x-radiko-user': 'dummy_user',
          'x-radiko-authtoken': authToken,
          'x-radiko-partialkey': partialKey,
        },
      })
    ).split(',')[0]!;
    if (areaId === 'OUT') this.raise_geo_restricted(undefined, ['JP']);
    return [authToken, areaId];
  }

  protected async _findProgram(station: string, cursor: number) {
    const xml = await this._download_webpage(
      `https://radiko.jp/v3/program/station/weekly/${station}.xml`,
      station,
      `Downloading radio program for ${station} station`,
    );
    for (const m of xml.matchAll(/<prog[^>]+ft="(?<ft>[^"]+)"[^>]+to="(?<to>[^"]+)"[\s\S]*?<title>(?<title>[^<]*)<\/title>/g)) {
      const ft = parseIso8601(m.groups!.ft!);
      const to = parseIso8601(m.groups!.to!);
      if (ft != null && to != null && ft <= cursor && cursor < to) {
        return { title: m.groups!.title, ft, ftStr: m.groups!.ft!, toStr: m.groups!.to! };
      }
    }
    throw new ExtractorError('Cannot identify radio program to download!');
  }

  protected async _extractFormats(
    videoId: string,
    station: string,
    isOnair: boolean,
    _authToken: string,
    _areaId: string,
    query: Record<string, string>,
  ): Promise<Format[]> {
    const xml = await this._download_webpage(
      `https://radiko.jp/v3/station/stream/pc_html5/${station}.xml`,
      videoId,
      'Downloading stream information',
    );
    const formats: Format[] = [];
    const found = new Set<string>();
    const timefree = isOnair ? 0 : 1;
    for (const m of xml.matchAll(new RegExp(`<url timefree="${timefree}">[\\s\\S]*?<playlist_create_url>([^<]+)</playlist_create_url>`, 'g'))) {
      const pcu = m[1]!;
      if (found.has(pcu)) continue;
      found.add(pcu);
      const playlistUrl = update_url_query(pcu, {
        station_id: station,
        ...query,
        l: '15',
        lsid: [...Array(32)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        type: 'b',
      });
      formats.push(
        ...(await extractM3u8FormatsAndSubtitles(this, playlistUrl, videoId, new URL(playlistUrl).hostname)).formats,
      );
    }
    return formats;
  }
}

export class RadikoIE extends RadikoBaseIE {
  static IE_NAME = 'radiko';
  static _VALID_URL = /https?:\/\/(?:www\.)?radiko\.jp\/#!\/ts\/(?<station>[A-Z0-9-]+)\/(?<timestring>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const station = m.groups!.station!;
    const timestring = m.groups!.timestring!;
    const videoId = join_nonempty(station, timestring)!;
    const vidInt = parseIso8601(timestring)!;
    const prog = await this._findProgram(station, vidInt);
    const [authToken, areaId] = await this._negotiateToken();
    return {
      id: videoId,
      title: prog.title,
      uploader_id: station,
      timestamp: vidInt,
      duration: parseIso8601(prog.toStr)! - parseIso8601(prog.ftStr)!,
      is_live: true,
      formats: await this._extractFormats(videoId, station, false, authToken, areaId, {
        start_at: prog.ftStr,
        ft: prog.ftStr,
        end_at: prog.toStr,
        to: prog.toStr,
        seek: timestring,
      }),
    };
  }
}

export class RadikoRadioIE extends RadikoBaseIE {
  static IE_NAME = 'radikoradio';
  static _VALID_URL = /https?:\/\/(?:www\.)?radiko\.jp\/#!\/live\/(?<id>[A-Z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const station = this._match_id(url);
    this.report_warning('Downloader will not stop at the end of the program! Press Ctrl+C to stop');
    const [authToken, areaId] = await this._negotiateToken();
    const vidNow = Math.trunc(Date.now() / 1000) + 9 * 3600;
    const prog = await this._findProgram(station, vidNow);
    return {
      id: station,
      title: prog.title,
      uploader_id: station,
      timestamp: prog.ft,
      formats: await this._extractFormats(station, station, true, authToken, areaId, {}),
      is_live: true,
    };
  }
}
