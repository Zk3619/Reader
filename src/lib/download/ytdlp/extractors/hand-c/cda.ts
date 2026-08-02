/**
 * CDA.pl — ported from yt-dlp cda.py
 *
 * Notes on pragmatic simplifications vs. upstream:
 * - Login (`_perform_login`, bearer-token caching) and the API extraction path that depends on
 *   it are not portable to this runtime and are omitted; extraction always uses the web
 *   (`/vfilm`) path, matching the unauthenticated behavior.
 * - The `rot13`/custom cipher `decrypt_file` obfuscation used by CDA's player.js is ported
 *   directly since it's pure string manipulation.
 * - Alternate-resolution pages (`quality-btn` links) are parsed and merged the same as upstream.
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, parse_duration } from '../../utils';
import { urljoin } from './_helpers';

const BASE_URL = 'https://www.cda.pl';

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function decryptFile(input: string): string {
  let a = input;
  for (const p of ['_XDDD', '_CDA', '_ADC', '_CXD', '_QWE', '_Q5', '_IKSDE']) {
    a = a.split(p).join('');
  }
  a = decodeURIComponent(a);
  let out = '';
  for (const ch of a) {
    const f = ch.charCodeAt(0);
    out += f >= 33 && f <= 126 ? String.fromCharCode(33 + ((f + 14) % 94)) : ch;
  }
  a = out.replace('.cda.mp4', '');
  for (const p of ['.2cda.pl', '.3cda.pl']) a = a.split(p).join('.cda.pl');
  if (a.includes('/upstream')) return `https://${a.replace('/upstream', '.mp4/upstream')}`;
  return `https://${a}.mp4`;
}

export class CDAIE extends InfoExtractor {
  static IE_NAME = 'cda';
  static _VALID_URL =
    /^https?:\/\/(?:(?:www|m)\.)?cda\.pl\/video|ebd\.cda\.pl\/[0-9]+x[0-9]+\/(?<id>[0-9a-z]+)/;

  protected async _extractFormat(
    page: string,
    version: string,
    videoId: string,
    formats: Format[],
    durationRef: { value?: number },
  ): Promise<void> {
    const jsonStr = this._html_search_regex(/player_data=(\\?["'])(?<player_data>.+?)\1/, page, `${version} player_json`, null, false, 'player_data');
    if (!jsonStr) return;
    const playerData = this._parse_json<Record<string, unknown>>(jsonStr, `${version} player_data`, undefined, false);
    if (!playerData) return;
    const video = playerData.video as Record<string, unknown> | undefined;
    if (!video || !video.file) {
      this.report_warning(`Unable to extract ${version} version information`);
      return;
    }
    const qualities = (video.qualities as Record<string, string>) || {};
    let videoQuality = video.quality as string | undefined;
    for (const [k, v] of Object.entries(qualities)) {
      if (v === videoQuality) {
        videoQuality = k;
        break;
      }
    }

    let file = String(video.file);
    if (file.startsWith('uggc')) {
      file = rot13(file);
      if (file.endsWith('adc.mp4')) file = file.replace('adc.mp4', '.mp4');
    } else if (!file.startsWith('http')) {
      file = decryptFile(file);
    }
    formats.push({
      url: file,
      format_id: videoQuality || 'default',
      height: videoQuality ? int_or_none(videoQuality.slice(0, -1)) ?? undefined : undefined,
    });

    for (const [quality, cdaQuality] of Object.entries(qualities)) {
      if (quality === videoQuality) continue;
      const response = await this._download_json<Record<string, unknown>>(
        `https://www.cda.pl/video/${videoId}`,
        videoId,
        `Fetching ${quality} url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'videoGetLink',
            id: 2,
            params: [videoId, cdaQuality, video.ts, video.hash2, {}],
          }),
          fatal: false,
        },
      );
      const result = response?.result as Record<string, unknown> | undefined;
      if (result?.status !== 'ok' || typeof result?.resp !== 'string') continue;
      const videoUrl = result.resp as string;
      const ext = determine_ext(videoUrl);
      if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
      } else if (ext === 'm3u8') {
        formats.push(...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      } else {
        formats.push({ url: videoUrl, format_id: quality, height: int_or_none(quality.slice(0, -1)) ?? undefined });
      }
    }

    if (!durationRef.value) {
      durationRef.value = parse_duration(video.duration) ?? undefined;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    let webpage = await this._download_webpage(`${BASE_URL}/video/${videoId}/vfilm`, videoId);

    if (webpage.includes('Ten film jest dostępny dla użytkowników premium')) {
      this.raise_login_required('This video is only available for premium users');
    }
    if (/niedostępn[ey] w(?:&nbsp;|\s+)Twoim kraju\s*</.test(webpage)) {
      this.raise_geo_restricted();
    }

    let needConfirmAge = false;
    if (this._html_search_regex(/(<button[^>]+name="[^"]*age_confirm[^"]*")/, webpage, 'birthday validate form', null, false)) {
      webpage = await this._httpGetText(`${BASE_URL}/video/${videoId}/vfilm`, {
        Referer: `${BASE_URL}/video/${videoId}/vfilm`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }, { method: 'POST', body: 'age_confirm=' });
      needConfirmAge = true;
    }

    const formats: Format[] = [];

    const title = this._og_search_title(webpage) ?? undefined;
    const description = this._og_search_description(webpage) ?? undefined;
    const thumbnail = this._og_search_thumbnail(webpage) ?? undefined;

    const durationRef: { value?: number } = {};
    await this._extractFormat(webpage, 'default', videoId, formats, durationRef);

    for (const m of webpage.matchAll(
      /<a[^>]+data-quality="[^"]+"[^>]+href="([^"]+)"[^>]+class="quality-btn"[^>]*>([0-9]+p)/g,
    )) {
      const href = m[1]!;
      const resolution = m[2]!;
      let nextPage: string | null;
      try {
        nextPage = await this._download_webpage(
          urljoin(BASE_URL, href) || href,
          videoId,
          `Downloading ${resolution} version information`,
        );
      } catch {
        nextPage = null;
      }
      if (!nextPage) {
        this.report_warning(`Unable to download ${resolution} version information`);
        continue;
      }
      await this._extractFormat(nextPage, resolution, videoId, formats, durationRef);
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      formats,
      duration: durationRef.value,
      age_limit: needConfirmAge ? 18 : 0,
    };
  }
}

export class CDAFolderIE extends InfoExtractor {
  static IE_NAME = 'cdafolder';
  static _VALID_URL = /^https?:\/\/(?:(?:www|m)\.)?cda\.pl\/(?<channel>[\w-]+)\/folder\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const folderId = match.groups!.id!;
    const channel = match.groups!.channel!;

    const webpage = await this._download_webpage(url, folderId);

    const entries: VideoInfo[] = [];
    let page = 0;
    for (;;) {
      let pageWebpage: string;
      try {
        pageWebpage = await this._download_webpage(
          `https://www.cda.pl/${channel}/folder/${folderId}/vfilm/${page + 1}`,
          folderId,
          `Downloading page ${page + 1}`,
          { fatal: false },
        );
      } catch {
        break;
      }
      if (!pageWebpage) break;
      const ids = [...pageWebpage.matchAll(/<a[^>]+href="\/video\/([0-9a-z]+)"/g)].map((m) => m[1]!);
      if (!ids.length) break;
      for (const vid of ids) entries.push(this.url_result(`https://www.cda.pl/video/${vid}`, 'CDA', vid));
      if (ids.length < 36) break;
      page++;
    }

    return this.playlist_result(entries, folderId, this._og_search_title(webpage) ?? undefined);
  }
}

