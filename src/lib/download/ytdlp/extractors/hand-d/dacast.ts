/**
 * Dacast family — ported from yt-dlp dacast.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, parse_qs, str_or_none, url_or_none } from '../../utils';

const API_INFO_URL = 'https://playback.dacast.com/content/info';
const USP_FALLBACK = 'hGDtqMKYVeFdofrAfFmBcrsakaZELajI';

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class DacastBaseIE extends InfoExtractor {
  static IE_NAME = 'dacastbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected static _URL_TYPE = '';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DacastBaseIE is not a standalone extractor', { expected: true });
  }

  protected static getUrlFromId(contentId: string, urlType: string): string {
    const [userId, mediaId] = contentId.split(`-${urlType}-`);
    return `https://iframe.dacast.com/${urlType}/${userId}/${mediaId}`;
  }

  protected async getUspSigningSecret(): Promise<string> {
    const playerJs = await this._download_webpage('https://player.dacast.com/js/player.js', undefined, 'Downloading player JS');
    return (
      this._search_regex(/\bUSP_SIGNING_SECRET\s*=\s*(["'])(?<secret>(?:(?!\1).)+)/, playerJs, 'usp signing secret', USP_FALLBACK, false, 'secret') ||
      USP_FALLBACK
    );
  }
}

export class DacastVODIE extends DacastBaseIE {
  static IE_NAME = 'dacast:vod';
  static _VALID_URL = /https?:\/\/iframe\.dacast\.com\/vod\/(?<user_id>[\w-]+)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const userId = m.groups!.user_id!;
    const videoId = m.groups!.id!;
    const qs = parse_qs(url);
    const query: Record<string, string> = {
      contentId: `${userId}-vod-${videoId}`,
      provider: 'universe',
    };
    if (qs.uss_token?.[0]) query.signedKey = qs.uss_token[0];

    const info = await this._download_json<Record<string, unknown>>(API_INFO_URL, videoId, undefined, {
      query,
      fatal: false,
    });
    const access = await this._download_json<Record<string, unknown>>(
      'https://playback.dacast.com/content/access',
      videoId,
      'Downloading access JSON',
      { query, fatal: false },
    );

    const error = access.error as string | undefined;
    if (error === 'Broadcaster has been blocked' || error === 'Content is offline') {
      throw new ExtractorError(error, { expected: true });
    }
    if (error) throw new ExtractorError(`Dacast API says "${error}"`);

    const hlsUrl = String(access.hls ?? '');
    const hlsAes: { uri?: string } = {};
    if (hlsUrl.includes('DRM_EXT')) {
      this.report_warning('DRM protected content');
    } else if (hlsUrl.includes('/uspaes/')) {
      const ts = Math.floor(Date.now() / 1000);
      const secret = await this.getUspSigningSecret();
      const signature = await sha1Hex(`${10413792000 - ts}${ts}${secret}`);
      hlsAes.uri = `https://keys.dacast.com/uspaes/${videoId}.key?s=${signature}&ts=${ts}`;
    }

    let formats: Format[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        formats = await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8', undefined, undefined, 'hls');
        break;
      } catch (e) {
        const cause = (e as ExtractorError & { cause?: { status?: number } }).cause;
        if (cause?.status === 403 && attempt < 2) continue;
        throw e;
      }
    }

    const contentInfo = (info?.contentInfo as Record<string, unknown>) || {};
    return {
      id: videoId,
      uploader_id: userId,
      formats,
      hls_aes: Object.keys(hlsAes).length ? hlsAes : undefined,
      title: str_or_none(contentInfo.title) ?? undefined,
      duration: float_or_none(contentInfo.duration) ?? undefined,
      thumbnail: url_or_none(contentInfo.thumbnailUrl) ?? undefined,
    };
  }
}

export class DacastPlaylistIE extends DacastBaseIE {
  static IE_NAME = 'dacast:playlist';
  static _VALID_URL = /https?:\/\/iframe\.dacast\.com\/playlist\/(?<user_id>[\w-]+)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const userId = m.groups!.user_id!;
    const playlistId = m.groups!.id!;
    const payload = await this._download_json<{ contentInfo: Record<string, unknown> }>(
      API_INFO_URL,
      playlistId,
      'Downloading playlist JSON',
      {
        query: { contentId: `${userId}-playlist-${playlistId}`, provider: 'universe' },
      },
    );
    const info = payload.contentInfo;
    const features = (info.features as Record<string, unknown>) || {};
    const playlist = (features.playlist as Record<string, unknown>) || {};
    const contents = Array.isArray(playlist.contents) ? playlist.contents : [];

    const entries = contents
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !!v.id)
      .map((video) =>
        this.url_result(
          DacastBaseIE.getUrlFromId(String(video.id), 'vod'),
          'DacastVOD',
          String(video.id),
          (video.title as string) ?? undefined,
        ),
      );

    return this.playlist_result(entries, playlistId, str_or_none(info.title) ?? undefined);
  }
}
