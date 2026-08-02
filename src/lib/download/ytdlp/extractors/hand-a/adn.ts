/**
 * ADNIE / ADNSeasonIE — aligned with yt-dlp adn.py (main API/HLS path)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  try_get,
  unified_strdate,
} from '../../utils';

const RSA_N = BigInt(
  '0x9B42B08905199A5CCE2026274399CA560ECB209EE9878A708B1C0812E1BB8CB5D1FB7441861147C1A1F2F3A0476DD63A9CAC20D3E983613346850AA6CB38F16DC7D720FD7D86FC6E5B3D5BBC72E14CD0BF9E869F2CEA2CCAD648F1DCE38F1FF916CEFB2D339B64AA0264372344BC775E265E8A852F88144AB0BD9AA06C1A4ABB',
);
const RSA_E = BigInt(65537);

function bytesToLong(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) + BigInt(b);
  return n;
}

function longToBytes(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  return out;
}

function pkcs1Pad(message: number[], size: number): Uint8Array {
  const padLen = size - message.length - 3;
  const out = new Uint8Array(size);
  out[0] = 0;
  out[1] = 2;
  for (let i = 0; i < padLen; i++) out[2 + i] = Math.floor(Math.random() * 254) + 1;
  out[2 + padLen] = 0;
  out.set(message, 3 + padLen);
  return out;
}

function rsaEncrypt(message: number[]): string {
  const padded = pkcs1Pad(message, 128);
  const encrypted = longToBytes(modPow(bytesToLong(padded), RSA_E, RSA_N), 128);
  return btoa(String.fromCharCode(...encrypted));
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  base %= mod;
  while (exp > BigInt(0)) {
    if (exp & BigInt(1)) result = (result * base) % mod;
    exp >>= BigInt(1);
    base = (base * base) % mod;
  }
  return result;
}

function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function stripOrNone(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

abstract class ADNBaseIE extends InfoExtractor {
  static IE_DESC = 'Animation Digital Network';
  static _NETRC_MACHINE = 'animationdigitalnetwork';

  protected _headers: Record<string, string> = {};
}

export class ADNIE extends ADNBaseIE {
  static IE_NAME = 'adn';
  static IE_DESC = 'Animation Digital Network';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?animationdigitalnetwork\.com\/(?:(?<lang>de)\/)?video\/[^/?#]+\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lang = m.groups!.lang;
    const videoId = m.groups!.id!;
    this._headers['X-Target-Distribution'] = lang || 'fr';

    const videoBaseUrl = `https://gw.api.animationdigitalnetwork.fr/player/video/${videoId}/`;
    const playerResp = await this._download_json<{ player: Record<string, unknown> }>(
      `${videoBaseUrl}configuration`,
      videoId,
      'Downloading player config JSON metadata',
      { headers: this._headers },
    );
    const player = playerResp.player;
    const options = player.options as Record<string, unknown>;
    const user = options.user as Record<string, unknown>;

    if (!user.hasAccess) {
      const startDate = str_or_none(traverse_obj(options, ['video', 'startDate']));
      if (startDate && Date.parse(startDate) > Date.now()) {
        throw new ExtractorError(
          `This video is not available yet. Release date: ${startDate}`,
          { expected: true },
        );
      }
      this.raise_login_required('This video requires a subscription', undefined, 'password');
    }

    const tokenResp = await this._download_json<{ token: string }>(
      String(
        user.refreshTokenUrl ||
          'https://gw.api.animationdigitalnetwork.fr/player/refresh/token',
      ),
      videoId,
      'Downloading access token',
      {
        method: 'POST',
        data: '',
        headers: {
          'X-Player-Refresh-Token': String(user.refreshToken || ''),
        },
      },
    );

    const linksUrl =
      str_or_none(
        try_get(options, (x: Record<string, unknown>) => {
          const video = x.video as Record<string, unknown> | undefined;
          return video?.url;
        }),
      ) || `${videoBaseUrl}link`;

    const k = randomHex(16);
    const message = [...JSON.stringify({ k, t: tokenResp.token })].map((c) => c.charCodeAt(0));

    let linksData: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const authorization = rsaEncrypt(message);
      try {
        linksData = await this._download_json<Record<string, unknown>>(
          linksUrl,
          videoId,
          'Downloading links JSON metadata',
          {
            headers: {
              'X-Player-Token': authorization,
              ...this._headers,
            },
            query: {
              freeWithAds: 'true',
              adaptive: 'false',
              withMetadata: 'true',
              source: 'Web',
            },
          },
        );
        break;
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
    if (!linksData) throw new ExtractorError('Giving up retrying', { expected: true });

    const links = (linksData.links as Record<string, unknown>) || {};
    const metas = (linksData.metadata as Record<string, unknown>) || {};
    const videoInfo = (linksData.video as Record<string, unknown>) || {};
    const title = String(metas.title || videoId);

    const formats: Format[] = [];
    const streaming = (links.streaming as Record<string, Record<string, string>>) || {};
    for (const [formatId, qualities] of Object.entries(streaming)) {
      if (!qualities || typeof qualities !== 'object') continue;
      for (const loadBalancerUrl of Object.values(qualities)) {
        const lb = await this._download_json<{ location?: string }>(
          loadBalancerUrl,
          videoId,
          `Downloading ${formatId} JSON metadata`,
          { headers: this._headers, fatal: false },
        );
        const m3u8Url = lb?.location;
        if (!m3u8Url) continue;
        const m3u8Formats = await this._extract_m3u8_formats(
          m3u8Url,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          formatId,
          undefined,
          false,
        );
        if (formatId === 'vf') {
          for (const f of m3u8Formats) f.language = 'fr';
        } else if (formatId === 'vde') {
          for (const f of m3u8Formats) f.language = 'de';
        }
        formats.push(...m3u8Formats);
      }
    }

    if (!formats.length) {
      this.raise_login_required('This video requires a subscription', undefined, 'password');
    }

    const videoMeta = await this._download_json<{ video?: Record<string, unknown> }>(
      `https://gw.api.animationdigitalnetwork.fr/video/${videoId}`,
      videoId,
      'Downloading additional video metadata',
      { headers: this._headers, fatal: false },
    );
    const video = videoMeta.video || {};
    const show = (video.show as Record<string, unknown>) || {};

    return {
      id: videoId,
      title,
      description: stripOrNone(metas.summary || video.summary),
      thumbnail: str_or_none(videoInfo.image || player.image) || undefined,
      formats,
      episode: str_or_none(metas.subtitle || video.name) || undefined,
      episode_number: int_or_none(video.shortNumber) ?? undefined,
      series: str_or_none(show.title) || undefined,
      season_number: int_or_none(video.season) ?? undefined,
      duration: int_or_none(videoInfo.duration || video.duration) ?? undefined,
      release_date: unified_strdate(video.releaseDate) || undefined,
      average_rating: float_or_none(video.rating || metas.rating) ?? undefined,
      comment_count: int_or_none(video.commentsCount) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: ADNIE.IE_NAME,
      extractor_key: 'ADN',
    };
  }
}

export class ADNSeasonIE extends ADNBaseIE {
  static IE_NAME = 'adnseason';
  static IE_DESC = 'Animation Digital Network';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?animationdigitalnetwork\.com\/(?:(?<lang>de)\/)?video\/(?<id>\d+)[^/?#]*\/?(?:$|[#?])/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lang = m.groups!.lang;
    const videoShowSlug = m.groups!.id!;
    this._headers['X-Target-Distribution'] = lang || 'fr';

    const showResp = await this._download_json<{ show: Record<string, unknown> }>(
      `https://gw.api.animationdigitalnetwork.fr/show/${videoShowSlug}/`,
      videoShowSlug,
      'Downloading show JSON metadata',
      { headers: this._headers },
    );
    const show = showResp.show;
    const showId = String(show.id || videoShowSlug);

    const episodes = await this._download_json<{ videos?: Record<string, unknown>[] }>(
      `https://gw.api.animationdigitalnetwork.fr/video/show/${showId}`,
      videoShowSlug,
      'Downloading episode list',
      {
        headers: this._headers,
        query: { order: 'asc', limit: '-1' },
      },
    );

    const entries = ((episodes.videos as Record<string, unknown>[]) || [])
      .map((v) => str_or_none(v.id))
      .filter(Boolean)
      .map((episodeId) => {
        const parts = ['https://animationdigitalnetwork.com'];
        if (lang) parts.push(lang);
        parts.push('video', videoShowSlug, episodeId!);
        return this.url_result(parts.join('/'), 'ADN', episodeId!);
      });

    return this.playlist_result(entries, showId, str_or_none(show.title));
  }
}
