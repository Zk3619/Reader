// @ts-nocheck
/** ViuBaseIE / ViuIE / ViuPlaylistIE / ViuOTTIE / ViuOTTIndonesia* â€?ported from yt-dlp viu.py */

import { randomUUID } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  remove_end,
  smuggle_url,
  try_get,
  unified_timestamp,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, strip_or_none } from './_helpers';

export class ViuBaseIE extends InfoExtractor {
  static IE_NAME = 'viu:base';
  static _VALID_URL = false as const;

  protected async _call_api(
    path: string,
    videoId: string,
    note?: string,
    opts?: { headers?: Record<string, string>; query?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    const body = await this._download_json<{ response: Record<string, unknown> }>(
      `https://www.viu.com/api/${path}`,
      videoId,
      note,
      {
        headers: { ...this.geo_verification_headers(), ...(opts?.headers || {}) },
        query: opts?.query,
      },
    );
    const response = body.response || {};
    if (response.status !== 'success') {
      throw new ExtractorError(
        `${this.IE_NAME} said: ${String(response.message || 'unknown error')}`,
        { expected: true },
      );
    }
    return response;
  }
}

export class ViuIE extends ViuBaseIE {
  static IE_NAME = 'viu';
  static _VALID_URL = /(?:viu:|https?:\/\/[^/]+\.viu\.com\/[a-z]{2}\/media\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = (
      (
        await this._call_api('clip/load', videoId, 'Downloading video data', {
          query: { appid: 'viu_desktop', fmt: 'json', id: videoId },
        })
      ).item as Array<Record<string, unknown>>
    )[0]!;

    const title = String(videoData.title || videoId);
    let m3u8Url: string | undefined;
    const urlPath = (videoData.urlpathd || videoData.urlpath) as string | undefined;
    const tdir = videoData.tdirforwhole as string | undefined;
    const hlsFile = videoData.jwhlsfile as string | undefined;
    if (urlPath && tdir && hlsFile) {
      m3u8Url = `${urlPath}/${tdir}/${hlsFile}`;
    } else {
      m3u8Url = String(videoData.href || '');
    }
    if (!m3u8Url) throw new ExtractorError('Unable to extract m3u8 URL', { expected: true });

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId);

    for (const [key, value] of Object.entries(videoData)) {
      const m = /^subtitle_(?<lang>[^_]+)_(?<ext>(?:vtt|srt))$/.exec(key);
      if (!m?.groups || typeof value !== 'string') continue;
      (subtitles[m.groups.lang!] ||= []).push({ url: value, ext: m.groups.ext! });
    }

    return {
      id: videoId,
      title,
      description: videoData.description ? String(videoData.description) : undefined,
      series: videoData.moviealbumshowname ? String(videoData.moviealbumshowname) : undefined,
      episode: title,
      episode_number: int_or_none(videoData.episodeno) ?? undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class ViuPlaylistIE extends ViuBaseIE {
  static IE_NAME = 'viu:playlist';
  static _VALID_URL = /https?:\/\/www\.viu\.com\/[^/]+\/listing\/playlist-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const playlistData = (
      await this._call_api('container/load', playlistId, 'Downloading playlist info', {
        query: { appid: 'viu_desktop', fmt: 'json', id: `playlist-${playlistId}` },
      })
    ).container as Record<string, unknown>;

    const entries: VideoInfo[] = [];
    for (const item of (playlistData.item as Array<Record<string, unknown>>) || []) {
      const itemId = item.id != null ? String(item.id) : '';
      if (!itemId) continue;
      entries.push(this.url_result(`viu:${itemId}`, 'Viu', itemId));
    }
    return this.playlist_result(entries, playlistId, playlistData.title ? String(playlistData.title) : undefined);
  }
}

export class ViuOTTIE extends InfoExtractor {
  static IE_NAME = 'viu:ott';
  static _NETRC_MACHINE = 'viu';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?viu\.com\/ott\/(?<country_code>[a-z]{2})\/(?<lang_code>[a-z]{2}-[a-z]{2})\/vod\/(?<id>\d+)/;

  static _AREA_ID: Record<string, number> = { HK: 1, SG: 2, TH: 4, PH: 5 };
  static _LANGUAGE_FLAG: Record<string, number> = { 'zh-hk': 1, 'zh-cn': 2, 'en-us': 3 };

  protected _user_token: string | null = null;
  protected _auth_codes: Record<string, string> = {};

  protected _detect_error(response: Record<string, unknown>): Record<string, unknown> {
    const code = try_get(response, (x) => (x.status as Record<string, unknown>)?.code) as
      | number
      | undefined;
    if (code && code > 0) {
      const message = try_get(response, (x) => (x.status as Record<string, unknown>)?.message);
      throw new ExtractorError(`${this.IE_NAME} said: ${message} (${code})`, { expected: true });
    }
    return (response.data as Record<string, unknown>) || {};
  }

  protected async _login(countryCode: string, videoId: string): Promise<string | undefined> {
    if (this._user_token != null) return this._user_token;
    // Login requires credentials; skip when unavailable.
    void countryCode;
    void videoId;
    return undefined;
  }

  protected async _get_token(countryCode: string, videoId: string): Promise<string> {
    const rand = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
    const data = await this._download_json<{ token: string }>(
      `https://api-gateway-global.viu.com/api/auth/token?v=${rand}000`,
      videoId,
      'Getting bearer token',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        data: JSON.stringify({
          countryCode: countryCode.toUpperCase(),
          platform: 'browser',
          platformFlagLabel: 'web',
          language: 'en',
          uuid: randomUUID(),
          carrierId: '0',
        }),
      },
    );
    return data.token;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, idata] = unsmuggle_url(url, {});
    const m = this._match_valid_url(cleanUrl)!;
    const countryCode = m.groups!.country_code!;
    const langCode = m.groups!.lang_code!;
    const videoId = m.groups!.id!;

    const query: Record<string, string> = {
      r: 'vod/ajax-detail',
      platform_flag_label: 'web',
      product_id: videoId,
    };
    const areaId = ViuOTTIE._AREA_ID[countryCode.toUpperCase()];
    if (areaId) query.area_id = String(areaId);

    const productData = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `http://www.viu.com/ott/${countryCode}/index.php`,
        videoId,
        'Downloading video info',
        { query },
      )
    ).data;

    const videoData = productData.current_product as Record<string, unknown> | undefined;
    if (!videoData) this.raise_geo_restricted();

    const seriesId = videoData!.series_id != null ? String(videoData!.series_id) : '';
    const forceNoPlaylist = Boolean(idata.force_noplaylist) || Boolean(this.params.noplaylist);
    if (seriesId && !forceNoPlaylist && !this.params.noplaylist) {
      const series = (productData.series as Record<string, unknown>) || {};
      const product = series.product as Array<Record<string, unknown>> | undefined;
      if (product?.length) {
        const entries = [...product]
          .sort((a, b) => (int_or_none(a.number) || 0) - (int_or_none(b.number) || 0))
          .map((entry) => {
            const itemId = entry.product_id != null ? String(entry.product_id) : '';
            if (!itemId) return null;
            return this.url_result(
              smuggle_url(`http://www.viu.com/ott/${countryCode}/${langCode}/vod/${itemId}/`, {
                force_noplaylist: true,
              }),
              'ViuOTT',
              itemId,
              String(entry.synopsis || '').trim() || undefined,
            );
          })
          .filter(Boolean) as VideoInfo[];
        return this.playlist_result(
          entries,
          seriesId,
          series.name ? String(series.name) : undefined,
          series.description ? String(series.description) : undefined,
        );
      }
    }

    let durationLimit = false;
    const pbQuery: Record<string, string> = {
      ccs_product_id: String(videoData!.ccs_product_id),
      language_flag_id: String(ViuOTTIE._LANGUAGE_FLAG[langCode.toLowerCase()] || '3'),
    };

    if (!this._auth_codes[countryCode]) {
      this._auth_codes[countryCode] = await this._get_token(countryCode, videoId);
    }

    const downloadPlayback = async (): Promise<Record<string, unknown> | undefined> => {
      const streamData = await this._download_json<Record<string, unknown>>(
        'https://api-gateway-global.viu.com/api/playback/distribute',
        videoId,
        'Downloading stream info',
        {
          fatal: false,
          query: pbQuery,
          headers: {
            Authorization: `Bearer ${this._auth_codes[countryCode]}`,
            Referer: cleanUrl,
            Origin: cleanUrl,
          },
        },
      );
      if (!streamData) return undefined;
      return this._detect_error(streamData).stream as Record<string, unknown> | undefined;
    };

    let streamData: Record<string, unknown> | undefined;
    try {
      streamData = await downloadPlayback();
    } catch {
      const token = await this._login(countryCode, videoId);
      if (token) pbQuery.identity = token;
      else {
        durationLimit = true;
        pbQuery.duration = '180';
      }
      try {
        streamData = await downloadPlayback();
      } catch {
        if (token) throw new ExtractorError('Cannot get stream info', { expected: true });
        this.raise_login_required('Login required for full stream', undefined, 'password');
      }
    }
    if (!streamData) throw new ExtractorError('Cannot get stream info', { expected: true });

    const formats: Format[] = [];
    for (const [vidFormat, streamUrlRaw] of Object.entries(
      (streamData.url as Record<string, string>) || {},
    )) {
      let streamUrl = streamUrlRaw;
      const height = int_or_none(this._search_regex(/s(\d+)p/, vidFormat, 'height', undefined, false));
      if (durationLimit) {
        try {
          const u = new URL(streamUrl);
          u.searchParams.set('duration', String(videoData!.time_duration || '9999999'));
          u.searchParams.set('duration_start', '0');
          streamUrl = u.toString();
        } catch {
          /* keep original */
        }
      }
      formats.push({
        format_id: vidFormat,
        url: streamUrl,
        height: height ?? undefined,
        ext: 'mp4',
        filesize: try_get(streamData, (x) => (x.size as Record<string, number>)?.[vidFormat]) as
          | number
          | undefined,
      });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (videoData!.subtitle as Array<Record<string, unknown>>) || []) {
      const lang = String(sub.name || 'und');
      if (sub.url) {
        (subtitles[lang] ||= []).push({
          url: String(sub.url),
          ext: 'srt',
          name: `Spoken text for ${lang}`,
        });
      }
      if (sub.second_subtitle_url) {
        (subtitles[`${lang}_ost`] ||= []).push({
          url: String(sub.second_subtitle_url),
          ext: 'srt',
          name: `On-screen text for ${lang}`,
        });
      }
    }

    const title = strip_or_none(videoData!.synopsis);
    return {
      id: videoId,
      title: title || undefined,
      description: videoData!.description ? String(videoData!.description) : undefined,
      series: try_get(productData, (x) => (x.series as Record<string, unknown>)?.name) as
        | string
        | undefined,
      episode: title || undefined,
      episode_number: int_or_none(videoData!.number) ?? undefined,
      duration: int_or_none(streamData.duration) ?? undefined,
      thumbnail: url_or_none(videoData!.cover_image_url) || undefined,
      formats,
      subtitles,
    };
  }
}

export class ViuOTTIndonesiaBaseIE extends InfoExtractor {
  static IE_NAME = 'viu:ott:indonesia:base';
  static _VALID_URL = false as const;

  static _BASE_QUERY = {
    ver: '1.0',
    fmt: 'json',
    aver: '5.0',
    appver: '2.0',
    appid: 'viu_desktop',
    platform: 'desktop',
  };

  static _DEVICE_ID = randomUUID();
  static _SESSION_ID = randomUUID();
  static _TOKEN: string | null = null;

  static _HEADERS: Record<string, string> = {
    'x-session-id': ViuOTTIndonesiaBaseIE._SESSION_ID,
    'x-client': 'browser',
  };

  static _AGE_RATINGS_MAPPER: Record<string, number> = {
    ADULTS: 18,
    teens: 13,
  };

  async _real_initialize(): Promise<void> {
    if (ViuOTTIndonesiaBaseIE._TOKEN) return;
    const data = await this._download_json<{ token: string }>(
      'https://um.viuapi.io/user/identity',
      undefined,
      'Downloading token information',
      {
        headers: { 'Content-type': 'application/json', ...ViuOTTIndonesiaBaseIE._HEADERS },
        query: { ...ViuOTTIndonesiaBaseIE._BASE_QUERY, iid: ViuOTTIndonesiaBaseIE._DEVICE_ID },
        method: 'POST',
        data: JSON.stringify({ deviceId: ViuOTTIndonesiaBaseIE._DEVICE_ID }),
      },
    );
    ViuOTTIndonesiaBaseIE._TOKEN = data.token;
  }
}

export class ViuOTTIndonesiaIE extends ViuOTTIndonesiaBaseIE {
  static IE_NAME = 'viuottindonesia';
  static _VALID_URL = /https?:\/\/www\.viu\.com\/ott\/\w+\/\w+\/all\/video-[\w-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const videoData = await this._download_json<{ playUrl: string }>(
      `https://um.viuapi.io/drm/v1/content/${displayId}`,
      displayId,
      undefined,
      {
        method: 'POST',
        data: '',
        headers: {
          Authorization: ViuOTTIndonesiaBaseIE._TOKEN || '',
          ...ViuOTTIndonesiaBaseIE._HEADERS,
          ccode: 'ID',
        },
      },
    );
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      videoData.playUrl,
      displayId,
    );

    const initialState = this._search_json<{ content: { clipDetails: Record<string, unknown> } }>(
      /window\.__INITIAL_STATE__\s*=/,
      webpage,
      'initial state',
      displayId,
    )!;
    const clipDetails = initialState.content.clipDetails;
    for (const [key, subUrl] of Object.entries(clipDetails)) {
      const m = /^subtitle_(?<lang>[\w-]+)_(?<ext>\w+)$/.exec(key);
      if (!m?.groups || typeof subUrl !== 'string') continue;
      const { lang, ext } = m.groups;
      (subtitles[lang!] ||= []).push({ ext: ext!, url: subUrl });
      if (ext === 'vtt') {
        subtitles[lang!]!.push({
          ext: 'srt',
          url: `${remove_end(subUrl, 'vtt') || subUrl}srt`,
        });
      }
    }

    const episode =
      this._search_json_ld(webpage, displayId, {
        fatal: false,
        expected_type: ['TVEpisode', 'Movie'],
      }) || {};

    const actors = Array.isArray(episode.actor)
      ? (episode.actor as Array<Record<string, unknown>>)
          .map((a) => (a?.name != null ? String(a.name) : ''))
          .filter(Boolean)
      : undefined;

    return {
      id: displayId,
      title:
        String(clipDetails.title || clipDetails.display_title || '') ||
        (episode.name as string) ||
        displayId,
      description: (clipDetails.description as string) || (episode.description as string) || undefined,
      duration: int_or_none(clipDetails.duration) ?? undefined,
      thumbnail:
        url_or_none((episode.image as Record<string, unknown> | undefined)?.url) || undefined,
      timestamp: unified_timestamp(episode.dateCreated) ?? undefined,
      formats,
      subtitles,
      episode_number:
        int_or_none(clipDetails.episode_no) ??
        int_or_none(clipDetails.episodeno) ??
        int_or_none(episode.episodeNumber) ??
        undefined,
      cast: actors,
      age_limit:
        ViuOTTIndonesiaBaseIE._AGE_RATINGS_MAPPER[String(clipDetails.internal_age_rating || '')] ??
        undefined,
    };
  }
}
