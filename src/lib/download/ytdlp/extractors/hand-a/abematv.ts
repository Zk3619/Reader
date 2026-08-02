/**
 * AbemaTVIE / AbemaTVTitleIE — aligned with yt-dlp abematv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import {
  int_or_none,
  str_or_none,
  traverse_obj,
  update_url_query,
} from '../../utils';

const SECRET_KEY = 'v+Gjs=25Aw5erR!J8ZuvRrCx*rGswhB&qdHd_SYerEWdU&a?3DzN9BRbp5KwY4hEmcj5#fykMjJ=AuWz5GSMY-d@H7DMEh3M@9n2G552Us$$k9cD=3TxwWe86!x#Zyhe';

function timeSeconds(hours = 0): number {
  return Math.trunc(Date.now() / 1000) + hours * 3600;
}

async function hmacSha256(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

function b64UrlSafe(data: Uint8Array): string {
  let s = btoa(String.fromCharCode(...data));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

abstract class AbemaTVBaseIE extends InfoExtractor {
  static _NETRC_MACHINE = 'abematv';

  private static _userToken: string | null = null;
  private static _deviceId: string | null = null;

  static async _generateAks(deviceId: string): Promise<string> {
    const enc = new TextEncoder();
    const deviceBytes = enc.encode(deviceId);
    const ts1hour = Math.trunc(Math.trunc(timeSeconds() / 3600 + 1) * 3600);
    const d = new Date(ts1hour * 1000);
    const ts1hourStr = enc.encode(String(ts1hour));

    let tmp = await hmacSha256(enc.encode(SECRET_KEY), enc.encode(SECRET_KEY));

    const mixOnce = async (nonce: Uint8Array) => {
      tmp = await hmacSha256(nonce, enc.encode(SECRET_KEY));
    };
    const mixTmp = async (count: number) => {
      for (let i = 0; i < count; i++) tmp = await hmacSha256(tmp, enc.encode(SECRET_KEY));
    };
    const mixTwist = async (nonce: Uint8Array) => {
      tmp = await hmacSha256(
        new Uint8Array([...enc.encode(b64UrlSafe(tmp)), ...nonce]),
        enc.encode(SECRET_KEY),
      );
    };

    await mixOnce(enc.encode(SECRET_KEY));
    await mixTmp(d.getUTCMonth() + 1);
    await mixTwist(deviceBytes);
    await mixTmp(d.getUTCDate() % 5);
    await mixTwist(ts1hourStr);
    await mixTmp(d.getUTCHours() % 5);

    return b64UrlSafe(tmp);
  }

  async _getDeviceToken(): Promise<string> {
    if (AbemaTVBaseIE._userToken) return AbemaTVBaseIE._userToken;

    AbemaTVBaseIE._deviceId = crypto.randomUUID();
    const aks = await AbemaTVBaseIE._generateAks(AbemaTVBaseIE._deviceId);
    const userData = await this._download_json<{ token: string }>(
      'https://api.abema.io/v1/users',
      undefined,
      'Authorizing',
      {
        method: 'POST',
        data: JSON.stringify({
          deviceId: AbemaTVBaseIE._deviceId,
          applicationKeySecret: aks,
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    AbemaTVBaseIE._userToken = userData.token;
    return AbemaTVBaseIE._userToken;
  }

  async _callApi(endpoint: string, videoId: string, query: Record<string, string> = {}, note?: string) {
    const token = await this._getDeviceToken();
    return this._download_json<Record<string, unknown>>(
      `https://api.abema.io/${endpoint}`,
      videoId,
      note,
      {
        query,
        headers: { Authorization: `bearer ${token}` },
      },
    );
  }

  _extractBreadcrumbList(webpage: string): string[] {
    const re =
      /<\/span><\/li><\/ul><script[^>]+type=(["'])application\/ld\+json\1[^>]*>([\s\S]+?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(webpage))) {
      try {
        const jsonld = JSON.parse(m[2]!) as Record<string, unknown>;
        if (jsonld['@type'] !== 'BreadcrumbList') continue;
        const elements = (jsonld.itemListElement as Record<string, unknown>[]) || [];
        const items = elements
          .map((el) => String(el.name || ''))
          .filter(Boolean);
        if (items.length) return items;
      } catch {
        /* continue */
      }
    }
    return [];
  }
}

export class AbemaTVIE extends AbemaTVBaseIE {
  static IE_NAME = 'abematv';
  static _VALID_URL =
    /https?:\/\/abema\.tv\/(?<type>now-on-air|video\/episode|channels\/.+?\/slots)\/(?<id>[^?/]+)/i;

  private static _timetable: Record<string, unknown> | null = null;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    let videoType = m.groups!.type!.split('/').pop()!;

    const token = await this._getDeviceToken();
    const headers = { Authorization: `Bearer ${token}` };

    const webpage = await this._download_webpage(url, videoId);
    const canonicalUrl =
      this._search_regex(
        /<link\s+rel="canonical"\s*href="(.+?)"/,
        webpage,
        'canonical URL',
        url,
        false,
      ) || url;
    const info: Record<string, unknown> = this._search_json_ld(webpage, videoId, {
      fatal: false,
    });

    let title = this._search_regex(
      /<span\s*class=".+?EpisodeTitleBlock__title">(.+?)<\/span>/,
      webpage,
      'title',
      null,
      false,
    );

    if (!title) {
      const jldRe =
        /<span\s*class="com-m-Thumbnail__image">(?:<\/span>)?<script[^>]+type=(["'])application\/ld\+json\1[^>]*>([\s\S]+?)<\/script>/gi;
      let jm: RegExpExecArray | null;
      while ((jm = jldRe.exec(webpage))) {
        try {
          const jsonld = JSON.parse(jm[2]!) as Record<string, unknown>;
          if (jsonld.caption) {
            title = String(jsonld.caption);
            break;
          }
        } catch {
          /* continue */
        }
      }
    }

    if (!title && videoType === 'now-on-air') {
      if (!AbemaTVIE._timetable) {
        AbemaTVIE._timetable = await this._download_json<Record<string, unknown>>(
          'https://api.abema.io/v1/timetable/dataSet?debug=false',
          videoId,
          undefined,
          { headers },
        );
      }
      const now = timeSeconds(9);
      for (const slot of (AbemaTVIE._timetable.slots as Record<string, unknown>[]) || []) {
        if (slot.channelId !== videoId) continue;
        if ((slot.startAt as number) <= now && now < (slot.endAt as number)) {
          title = String(slot.title || '');
          break;
        }
      }
    }

    const breadcrumb = this._extractBreadcrumbList(webpage);
    if (breadcrumb.length >= 2) {
      info.series = breadcrumb[breadcrumb.length - 2];
      info.episode = breadcrumb[breadcrumb.length - 1];
      if (!title) title = String(info.episode);
    }

    let description =
      this._search_regex(
        [
          /<p\s+class="com-video-EpisodeDetailsBlock__content"><span\s+class=".+?">(.+?)<\/span><\/p><div/,
          /<span\s+class=".+?SlotSummary.+?">(.+?)<\/span><\/div><div/,
        ],
        webpage,
        'description',
        null,
        false,
      ) || null;

    if (!description) {
      const ogDesc = this._html_search_meta(
        ['description', 'og:description', 'twitter:description'],
        webpage,
      );
      if (ogDesc) {
        description = ogDesc
          .replace(
            /^(.+?)(?:アニメの動画を無料で見るならABEMA！|等、.+)?$/s,
            '$1',
          )
          .trim();
      }
    }

    const canonM = canonicalUrl.match(/s(\d+)_p(\d+)$/);
    if (canonM) {
      const seri = int_or_none(canonM[1]);
      const epis = int_or_none(canonM[2]);
      if (seri != null && seri < 100) info.season_number = seri;
      if (epis != null && epis < 2000) info.episode_number = epis;
    }

    let isLive = false;
    let m3u8Url: string | null = null;
    let availability = 'public';

    if (videoType === 'now-on-air') {
      isLive = true;
      let channelUrl = 'https://api.abema.io/v1/channels';
      if (videoId === 'news-global') {
        channelUrl = update_url_query(channelUrl, { division: '1' });
      }
      const onair = await this._download_json<{ channels: Record<string, unknown>[] }>(
        channelUrl,
        videoId,
        undefined,
        { headers },
      );
      const ch = onair.channels.find((c) => c.id === videoId);
      if (!ch) {
        throw new ExtractorError(`Cannot find on-air ${videoId} channel.`, { expected: true });
      }
      m3u8Url = traverse_obj(ch, ['playback', 'hls']) as string;
    } else if (videoType === 'episode') {
      const apiResponse = await this._download_json<Record<string, unknown>>(
        `https://api.abema.io/v1/video/programs/${videoId}`,
        videoId,
        'Checking playability',
        { headers },
      );
      if (!traverse_obj(apiResponse, ['label', 'free'])) {
        this.report_warning('This is a premium-only stream');
        availability = 'premium_only';
      }
      Object.assign(info, {
        series: traverse_obj(apiResponse, ['series', 'title']),
        season: traverse_obj(apiResponse, ['season', 'name']),
        season_number: traverse_obj(apiResponse, ['season', 'sequence']),
        episode_number: traverse_obj(apiResponse, ['episode', 'number']),
      });
      if (!title) title = str_or_none(traverse_obj(apiResponse, ['episode', 'title']));
      if (!description) description = str_or_none(traverse_obj(apiResponse, ['episode', 'content']));
      m3u8Url = `https://vod-abematv.akamaized.net/program/${videoId}/playlist.m3u8`;
    } else if (videoType === 'slots') {
      const apiResponse = await this._download_json<Record<string, unknown>>(
        `https://api.abema.io/v1/media/slots/${videoId}`,
        videoId,
        'Checking playability',
        { headers },
      );
      if (!traverse_obj(apiResponse, ['slot', 'flags', 'timeshiftFree'], { default: false })) {
        this.report_warning('This is a premium-only stream');
        availability = 'premium_only';
      }
      m3u8Url = `https://vod-abematv.akamaized.net/slot/${videoId}/playlist.m3u8`;
    } else {
      throw new ExtractorError('Unreachable', { expected: true });
    }

    if (isLive) {
      this.report_warning(
        "This is a livestream; yt-dlp doesn't support downloading natively, but FFmpeg cannot handle m3u8 manifests from AbemaTV",
      );
    }

    const formats = m3u8Url
      ? await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)
      : [];

    const thumb = this._og_search_thumbnail(webpage);
    const thumbnails: Thumbnail[] | undefined = thumb ? [{ url: thumb.split('?')[0]! }] : undefined;

    return {
      id: videoId,
      title: title || videoId,
      description,
      formats,
      is_live: isLive,
      availability,
      series: str_or_none(info.series) || undefined,
      season: str_or_none(info.season) || undefined,
      season_number: int_or_none(info.season_number) ?? undefined,
      episode: str_or_none(info.episode) || undefined,
      episode_number: int_or_none(info.episode_number) ?? undefined,
      thumbnails,
      thumbnail: thumb || undefined,
      webpage_url: url,
      original_url: url,
      extractor: AbemaTVIE.IE_NAME,
      extractor_key: 'AbemaTV',
    };
  }
}

export class AbemaTVTitleIE extends AbemaTVBaseIE {
  static IE_NAME = 'abematvtitle';
  static _VALID_URL =
    /https?:\/\/abema\.tv\/video\/title\/(?<id>[^?/#]+)\/?(?:\?(?:[^#]+&)?s=(?<season>[^&#]+))?/i;

  static _PAGE_SIZE = 25;

  async _fetchPage(
    playlistId: string,
    seriesVersion: string,
    seasonId: string | undefined,
    page: number,
  ): Promise<string[]> {
    const query: Record<string, string> = {
      seriesVersion,
      offset: String(page * AbemaTVTitleIE._PAGE_SIZE),
      order: 'seq',
      limit: String(AbemaTVTitleIE._PAGE_SIZE),
    };
    if (seasonId) query.seasonId = seasonId;
    const programs = await this._callApi(
      `v1/video/series/${playlistId}/programs`,
      playlistId,
      query,
      `Downloading page ${page + 1}`,
    );
    const list = (programs.programs as Record<string, unknown>[]) || [];
    return list.map((p) => `https://abema.tv/video/episode/${String(p.id || '')}`).filter(Boolean);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const seasonId = m.groups!.season;

    const seriesInfo = await this._callApi(`v1/video/series/${playlistId}`, playlistId);
    const version = String(seriesInfo.version || '');

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const urls = await this._fetchPage(playlistId, version, seasonId, page);
      if (!urls.length) break;
      entries.push(...urls.map((u) => this.url_result(u, 'AbemaTV')));
      if (urls.length < AbemaTVTitleIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      playlistId,
      str_or_none(seriesInfo.title),
      str_or_none(seriesInfo.content),
    );
  }
}
