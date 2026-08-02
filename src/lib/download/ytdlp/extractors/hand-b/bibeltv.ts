/**
 * BibelTVIE family — ported from yt-dlp bibeltv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, js_to_json, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601, searchNextjsData } from './_helpers';

const API_URL = 'https://www.bibeltv.de/mediathek/api';
const AUTH_TOKEN = 'j88bRXY8DsEqJ9xmTdWhrByVi5Hm';

export class BibelTVBaseIE extends InfoExtractor {
  static IE_NAME = 'bibeltvbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BibelTVBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractFormatsAndSubtitles(
    mediaUrls: unknown[],
    crnId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const raw of mediaUrls || []) {
      const mediaUrl = url_or_none(raw);
      if (!mediaUrl) continue;
      const ext = determine_ext(mediaUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, mediaUrl, crnId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        const mpdFormats = await this._extract_mpd_formats(mediaUrl, crnId, 'dash', undefined, false);
        formats.push(...mpdFormats);
      } else if (ext === 'mp4') {
        formats.push({ format_id: 'mp4', url: mediaUrl });
      } else {
        this.report_warning(`Unknown format ${ext}`);
      }
    }
    return { formats, subtitles };
  }

  protected _extractBaseInfo(data: Record<string, unknown>): Partial<VideoInfo> {
    return {
      id: String(data.crn ?? ''),
      title: (data.title as string) || undefined,
      description: (data.description as string) || undefined,
      duration: int_or_none(data.duration, 1000) ?? undefined,
      timestamp: parseIso8601(data.schedulingStart) ?? undefined,
      season_number: (data.seasonNumber as number) ?? undefined,
      episode_number: (data.episodeNumber as number) ?? undefined,
      view_count: (data.viewCount as number) ?? undefined,
      like_count: (data.likeCount as number) ?? undefined,
      thumbnails: ((data.images as Array<Record<string, unknown>>) || [])
        .map((img) => url_or_none(img.url))
        .filter((u): u is string => !!u)
        .map((u) => ({ url: u })),
    };
  }

  protected _extractUrlInfo(data: Record<string, unknown>): VideoInfo {
    const slug = data.slug as string | undefined;
    return {
      _type: 'url',
      url: slug ? `https://www.bibeltv.de/mediathek/videos/${slug}` : '',
      ...this._extractBaseInfo(data),
    } as VideoInfo;
  }

  protected async _extractVideoInfo(data: Record<string, unknown>): Promise<VideoInfo> {
    const crnId = String(data.crn ?? '');
    const jsonData = data.id
      ? await this._download_json<Record<string, unknown>>(`${API_URL}/video/${data.id}`, crnId, undefined, {
          headers: { Authorization: AUTH_TOKEN },
          fatal: false,
        })
      : {};

    const videoUrls = (((jsonData || {}).video as Record<string, unknown> | undefined)?.videoUrls as unknown[]) || [];
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(videoUrls, crnId);

    return {
      _type: 'video',
      ...this._extractBaseInfo(data),
      formats,
      subtitles,
    } as VideoInfo;
  }
}

export class BibelTVVideoIE extends BibelTVBaseIE {
  static IE_NAME = 'bibeltv:video';
  static IE_DESC = 'BibelTV single video';
  static _VALID_URL = /https?:\/\/(?:www\.)?bibeltv\.de\/mediathek\/videos\/(?<id>\d+)[\w-]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const crnId = this._match_id(url);
    const webpage = await this._download_webpage(url, crnId);
    const nextjsData = searchNextjsData(this, webpage, crnId);
    const pageProps = nextjsData.pageProps as Record<string, unknown> | undefined;
    const videoPageData = pageProps?.videoPageData as Record<string, unknown> | undefined;
    const videos = (videoPageData?.videos as Array<Record<string, unknown>> | undefined) || [];
    const videoData = videos[0];
    if (!videoData) throw new ExtractorError('Missing video data.');
    return this._extractVideoInfo(videoData);
  }
}

export class BibelTVSeriesIE extends BibelTVBaseIE {
  static IE_NAME = 'bibeltv:series';
  static IE_DESC = 'BibelTV series playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?bibeltv\.de\/mediathek\/serien\/(?<id>\d+)[\w-]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const crnId = this._match_id(url);
    const webpage = await this._download_webpage(url, crnId);
    const nextjsData = searchNextjsData(this, webpage, crnId);
    const seriesData = (nextjsData.pageProps as Record<string, unknown> | undefined)?.seriePageData as
      | Record<string, unknown>
      | undefined;
    if (!seriesData) throw new ExtractorError('Missing series data.');

    const videos = (seriesData.videos as Array<Record<string, unknown>>) || [];
    return this.playlist_result(
      videos.map((v) => this._extractUrlInfo(v)),
      crnId,
      (seriesData.title as string) || undefined,
      clean_html((seriesData.description as string) || null),
    );
  }
}

export class BibelTVLiveIE extends BibelTVBaseIE {
  static IE_NAME = 'bibeltv:live';
  static IE_DESC = 'BibelTV live program';
  static _VALID_URL = /https?:\/\/(?:www\.)?bibeltv\.de\/livestreams\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const streamId = this._match_id(url);
    const webpage = await this._download_webpage(url, streamId);
    const streamData = this._search_json<Record<string, unknown>>(/\\"video\\":/, webpage, 'bibeltvData', streamId, {
      transform_source: (s) => js_to_json(s.replace(/\\"/g, '"')),
    });

    const src = (streamData?.src as unknown[]) || [];
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(src, streamId);

    return {
      id: streamId,
      title: (streamData?.title as string) || undefined,
      thumbnail: (streamData?.poster as string) || undefined,
      is_live: true,
      formats,
      subtitles,
    };
  }
}
