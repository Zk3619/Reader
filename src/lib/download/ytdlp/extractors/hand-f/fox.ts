/**
 * FOXIE ??ported from yt-dlp fox.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, parse_duration, traverse_obj, try_get, unified_timestamp, url_or_none } from '../../utils';

function parseAgeLimit(rating: string): number | undefined {
  const m = /(\d+)/.exec(rating);
  return m ? Number(m[1]) : undefined;
}

export class FOXIE extends InfoExtractor {
  static IE_NAME = 'fox';
  static _VALID_URL = /https?:\/\/(?:www\.)?fox(?:sports)?\.com\/(?:watch|replay)\/(?<id>[\da-fA-F]+)/;

  protected _API_KEY = '6E9S4bmcoNnZwVLOHywOv8PJEdu76cM9';
  protected _accessToken: string | null = null;
  protected _deviceId = crypto.randomUUID();

  protected async _callApi(path: string, videoId: string | null, data?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'X-Api-Key': this._API_KEY };
    if (this._accessToken) headers.Authorization = `Bearer ${this._accessToken}`;
    try {
      return await this._download_json<Record<string, unknown>>(
        `https://api3.fox.com/v2.0/${path}`,
        videoId || undefined,
        undefined,
        { data, method: data ? 'POST' : 'GET', headers },
      );
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/403/.test(msg)) {
        throw new ExtractorError(
          'This video is only available via cable service provider subscription. You may want to use --cookies.',
          { expected: true },
        );
      }
      throw e;
    }
  }

  protected async _realInitialize(): Promise<void> {
    if (this._accessToken) return;
    const cookies = await this._get_cookies('https://www.fox.com/');
    const mvpdAuth = cookies['mvpd-auth'];
    if (mvpdAuth) {
      try {
        this._accessToken = (
          this._parse_json<Record<string, unknown>>(decodeURIComponent(mvpdAuth), undefined, null, false) || {}
        ).accessToken as string | undefined || null;
      } catch {
        /* ignore */
      }
    }
    if (!this._accessToken) {
      const login = await this._callApi('login', null, JSON.stringify({ deviceId: this._deviceId }));
      this._accessToken = String(login.accessToken ?? '');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    await this._realInitialize();

    const preview = await this._callApi(
      `previewpassmvpd?device_id=${this._deviceId}&mvpd_id=TempPass_fbcfox_60min`,
      videoId,
    );
    this._accessToken = String(preview.accessToken ?? this._accessToken);

    const video = await this._callApi(
      'watch',
      videoId,
      JSON.stringify({
        capabilities: ['drm/widevine', 'fsdk/yo'],
        deviceWidth: 1280,
        deviceHeight: 720,
        maxRes: '720p',
        os: 'macos',
        osv: '',
        provider: {
          freewheel: { did: this._deviceId },
          vdms: { rays: '' },
          dmp: { kuid: '', seg: '' },
        },
        playlist: '',
        privacy: { us: '1---' },
        siteSection: '',
        streamType: 'vod',
        streamId: videoId,
      }),
    );

    const title = String(video.name ?? videoId);
    const releaseUrl = String(video.url ?? '');
    let m3u8Url: string;
    try {
      m3u8Url = String((await this._download_json<{ playURL?: string }>(releaseUrl, videoId)).playURL ?? '');
    } catch (e) {
      throw new ExtractorError((e as Error).message, { expected: true });
    }

    const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    const data =
      (try_get(video, (x) => (x as Record<string, unknown>).trackingData as Record<string, unknown>)?.properties as
        | Record<string, unknown>
        | undefined) || {};

    const duration =
      int_or_none(video.durationInSeconds) ??
      int_or_none(video.duration) ??
      parse_duration(String(video.duration ?? '')) ??
      undefined;
    const timestamp = unified_timestamp(video.datePublished) ?? undefined;
    const creator = (data.brand as string | undefined) || (data.network as string | undefined) || (video.network as string | undefined);
    const series = (video.seriesName as string | undefined) || (data.seriesName as string | undefined) || (data.show as string | undefined);

    const subtitles: Record<string, Subtitle[]> = {};
    for (const docRel of (video.documentReleases as Array<Record<string, unknown>>) || []) {
      const relUrl = url_or_none(docRel.url);
      if (!relUrl || docRel.format !== 'SCC') continue;
      subtitles.en = [{ url: relUrl, ext: 'scc' }];
      break;
    }

    return {
      id: videoId,
      title,
      formats,
      description: video.description as string | undefined,
      duration,
      timestamp,
      age_limit: parseAgeLimit(String(video.contentRating ?? '')),
      creator,
      series,
      season_number: int_or_none(video.seasonNumber) ?? undefined,
      episode: video.name as string | undefined,
      episode_number: int_or_none(video.episodeNumber) ?? undefined,
      thumbnail: traverse_obj(video, ['images', 'still', 'raw', url_or_none]) as string | undefined,
      release_year: int_or_none(video.releaseYear) ?? undefined,
      subtitles,
    };
  }
}
