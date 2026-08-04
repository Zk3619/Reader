// @ts-nocheck
/**
 * WrestleUniverseVODIE / WrestleUniversePPVIE â€?ported from yt-dlp wrestleuniverse.py
 * Base lives in ../hand-s/stacommu.ts (do not redefine WrestleUniverseBaseIE here).
 */

import { ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, traverse_obj, url_or_none } from '../../utils';
import { url_basename } from './_helpers';
import { WrestleUniverseBaseIE } from '../hand-s/stacommu';

const VALID_URL_TMPL = (path: string) =>
  new RegExp(
    String.raw`https?://(?:www\.)?wrestle-universe\.com/(?:(?<lang>\w{2})/)?${path}/(?<id>\w+)`,
  );

type DecryptFn = (s: string | null | undefined) => string | null;

/** Local AES helper â€?upstream lives on WrestleUniverseBaseIE; stacommu base is thinner. */
function extractHlsAesInfo(
  videoData: Record<string, unknown>,
  decrypt: DecryptFn | null,
  reportWarning?: (msg: string) => void,
): { hls_aes?: { key?: string; iv?: string } } {
  if (!decrypt) return {};
  const hls = (videoData.hls || {}) as Record<string, unknown>;
  const key = decrypt(hls.key as string | undefined);
  if (key) {
    return {
      hls_aes: {
        key,
        iv: decrypt(hls.iv as string | undefined) || undefined,
      },
    };
  }
  if (int_or_none(hls.encryptType)) {
    reportWarning?.('HLS AES-128 key was not found in API response');
  }
  return {};
}

export class WrestleUniverseVODIE extends WrestleUniverseBaseIE {
  static IE_NAME = 'wrestleuniverse:vod';
  static _VALID_URL = VALID_URL_TMPL('videos');
  static _API_PATH = 'videoEpisodes';

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const m = this._match_valid_url(url)!;
    const lang = m.groups?.lang || '';
    const videoId = m.groups!.id!;
    const metadata = await this._downloadMetadata(url, videoId, lang, 'videoEpisodeFallbackData');

    let decrypt: DecryptFn | null = null;
    let videoData: Record<string, unknown>;
    try {
      videoData = await this._callApi(videoId, ':watch', 'watch', true, {
        deviceId: this._DEVICE_ID,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const cause = error instanceof ExtractorError ? (error as ExtractorError & { cause?: unknown }).cause : undefined;
      const statusMatch = /HTTP\s+(\d+)/i.exec(msg) || /HTTP\s+(\d+)/i.exec(String(cause || ''));
      if (statusMatch?.[1] !== '400') throw error;
      const enc = await this._callEncryptedApi(videoId, ':watch', 'watch', { method: 1 });
      videoData = enc[0];
      decrypt = enc[1];
    }

    const chapters = ((metadata.videoChapters as Record<string, unknown>[]) || [])
      .filter((v) => typeof v.start === 'number')
      .map((v) => ({
        title: strOrUndef(v.displayName),
        start_time: int_or_none(v.start) ?? 0,
        end_time: int_or_none(v.end) ?? undefined,
      }));

    return {
      id: videoId,
      formats: await this._getFormats(videoData, ['protocolHls', 'url'], videoId),
      ...extractHlsAesInfo(videoData, decrypt, (msg) => this.report_warning(msg)),
      title: strOrUndef(metadata.displayName) || videoId,
      description: metadata.description != null ? String(metadata.description) : undefined,
      channel: strOrUndef(traverse_obj(metadata, ['labels', 'group'])),
      location: strOrUndef(traverse_obj(metadata, ['labels', 'venue'])),
      timestamp: int_or_none(metadata.watchStartTime) ?? undefined,
      thumbnail: url_or_none(metadata.keyVisualUrl) || undefined,
      cast: ((metadata.casts as Record<string, unknown>[]) || [])
        .map((c) => String(c.displayName || ''))
        .filter(Boolean),
      duration: int_or_none(metadata.duration) ?? undefined,
      chapters: chapters.length ? chapters : undefined,
    };
  }
}

export class WrestleUniversePPVIE extends WrestleUniverseBaseIE {
  static IE_NAME = 'wrestleuniverse:ppv';
  static _VALID_URL = VALID_URL_TMPL('lives');
  static _API_PATH = 'events';

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const m = this._match_valid_url(url)!;
    const lang = m.groups?.lang || '';
    const videoId = m.groups!.id!;
    const metadata = await this._downloadMetadata(url, videoId, lang, 'eventFallbackData');

    const thumbnails = (['keyVisualUrl', 'alterKeyVisualUrl', 'heroKeyVisualUrl'] as const)
      .map((k) => url_or_none(metadata[k]))
      .filter(Boolean)
      .map((u) => ({ url: u! }));

    const info: VideoInfo = {
      id: videoId,
      title: strOrUndef(metadata.displayName) || videoId,
      description: metadata.description != null ? String(metadata.description) : undefined,
      channel: strOrUndef(traverse_obj(metadata, ['labels', 'group'])),
      location: strOrUndef(traverse_obj(metadata, ['labels', 'venue'])),
      timestamp: int_or_none(metadata.startTime) ?? undefined,
      thumbnail: thumbnails[0]?.url,
      thumbnails: thumbnails.length ? thumbnails : undefined,
    };

    const endedTime = int_or_none(metadata.endedTime);
    if (info.timestamp != null && endedTime != null) {
      info.duration = endedTime - info.timestamp;
    }

    const [videoData, decrypt] = await this._callEncryptedApi(
      videoId,
      ':watchArchive',
      'watch archive',
      { method: 1 },
    );

    // Prefer first HLS URL from urls[] or singular url (avoid chromecastUrls)
    const hls = (videoData.hls || {}) as Record<string, unknown>;
    const urls = Array.isArray(hls.urls) ? hls.urls : [];
    const hlsUrl = url_or_none(urls[0]) || url_or_none(hls.url);
    let formats: Format[] = [];
    if (hlsUrl) {
      formats = await this._getFormats({ ...videoData, _resolvedHls: hlsUrl }, ['_resolvedHls'], videoId);
    } else {
      formats = await this._getFormats(videoData, ['hls', 'url'], videoId);
    }

    for (const f of formats) {
      if (f.tbr) f.tbr = Math.trunc(f.tbr / 2.5);
      const base = (url_basename(f.url || '') || '').split('.')[0] || '';
      f.format_id = base || f.format_id;
      const manifestBase = (url_basename(f.manifest_url || f.url || '') || '').split('.')[0] || '';
      if (base && manifestBase && !base.startsWith(manifestBase)) {
        f.preference = -10;
      }
    }

    Object.assign(info, { formats }, extractHlsAesInfo(videoData, decrypt, (msg) => this.report_warning(msg)));
    return info;
  }
}

function strOrUndef(v: unknown): string | undefined {
  return v == null || v === '' ? undefined : String(v);
}
