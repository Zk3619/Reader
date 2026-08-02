/**
 * BiliIntl (bilibili.tv / biliintl.com) — aligned with bilibili.py
 * BiliIntlBaseIE / BiliIntlIE / BiliIntlSeriesIE.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, Subtitle, VideoInfo } from '../types';
import { biliJson2Srt } from './bilibili-subs';

const BILI_INTL_HEADERS: Record<string, string> = { Referer: 'https://www.bilibili.tv/' };
const BILI_INTL_API = 'https://api.bilibili.tv/intl/gateway';

export class BiliIntlBaseIE extends InfoExtractor {
  static IE_NAME = 'biliintlbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _API_URL = BILI_INTL_API;
  static _NETRC_MACHINE = 'biliintl';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BiliIntlBaseIE is a base class and cannot extract directly', {
      expected: true,
    });
  }

  protected async callApi(
    endpoint: string,
    videoId?: string,
    opts?: { query?: Record<string, string>; fatal?: boolean; note?: string },
  ): Promise<Record<string, unknown>> {
    const json = await this._download_json<Record<string, unknown>>(
      `${BILI_INTL_API}${endpoint}`,
      videoId,
      opts?.note,
      { headers: BILI_INTL_HEADERS, fatal: opts?.fatal ?? false, query: opts?.query },
    );
    const code = Number(json.code);
    if (code) {
      if ([10004004, 10004005, 10023006].includes(code)) {
        this.raise_login_required();
      } else if (code === 10004001) {
        this.raise_geo_restricted();
      } else if (opts?.fatal) {
        throw new ExtractorError(String(json.message || 'Unable to download JSON metadata'));
      } else {
        this.report_warning(String(json.message || 'Unable to download JSON metadata'));
      }
    }
    return (json.data as Record<string, unknown>) || {};
  }

  protected async getSubtitles(opts: {
    epId?: string;
    aid?: string;
  }): Promise<Record<string, Subtitle[]>> {
    const subJson = await this.callApi('/web/v2/subtitle', opts.epId || opts.aid, {
      note: 'Downloading subtitles list',
      query: {
        platform: 'web',
        s_locale: 'en_US',
        ...(opts.epId ? { episode_id: opts.epId } : {}),
        ...(opts.aid ? { aid: opts.aid } : {}),
      },
    });
    const subtitles: Record<string, Subtitle[]> = {};
    const fetchedUrls = new Set<string>();
    const lists = [subJson.subtitles, subJson.video_subtitle].filter(Array.isArray) as Array<
      Array<Record<string, unknown>>
    >;
    for (const list of lists) {
      for (const sub of list) {
        const candidates = [sub.url, (sub.ass as Record<string, unknown>)?.url, (sub.srt as Record<string, unknown>)?.url]
          .filter((u): u is string => typeof u === 'string' && !!u);
        for (const url of candidates) {
          if (fetchedUrls.has(url)) continue;
          fetchedUrls.add(url);
          const lang = String(sub.lang_key || 'en');
          const ext = (url.split('?')[0]!.split('.').pop() || '').toLowerCase();
          if (ext === 'ass') {
            (subtitles[lang] ||= []).push({ ext: 'ass', url });
          } else if (ext === 'json') {
            try {
              const subData = await this._download_json<{
                body?: Array<{ from?: number; to?: number; content?: string }>;
              }>(url, opts.epId || opts.aid, 'Downloading subtitles', {
                headers: BILI_INTL_HEADERS,
                fatal: false,
              });
              (subtitles[lang] ||= []).push({ ext: 'srt', data: biliJson2Srt(subData || {}) });
            } catch {
              (subtitles[lang] ||= []).push({ ext: 'json', url });
            }
          }
        }
      }
    }
    return subtitles;
  }

  protected async getFormats(opts: { epId?: string; aid?: string }): Promise<Format[]> {
    const videoJson = await this.callApi('/web/playurl', opts.epId || opts.aid, {
      note: 'Downloading video formats',
      query: { platform: 'web', ...(opts.epId ? { ep_id: opts.epId } : {}), ...(opts.aid ? { aid: opts.aid } : {}) },
    });
    const playurl = (videoJson.playurl || {}) as Record<string, unknown>;
    const formats: Format[] = [];
    for (const vid of (playurl.video as Array<Record<string, unknown>>) || []) {
      const videoRes = (vid.video_resource || {}) as Record<string, unknown>;
      const streamInfo = (vid.stream_info || {}) as Record<string, unknown>;
      if (!videoRes.url) continue;
      formats.push({
        format_id: String(videoRes.width || formats.length),
        url: String(videoRes.url),
        ext: 'mp4',
        format_note: streamInfo.desc_words != null ? String(streamInfo.desc_words) : undefined,
        width: Number(videoRes.width) || null,
        height: Number(videoRes.height) || null,
        vbr: Number(videoRes.bandwidth) || null,
        acodec: 'none',
        vcodec: videoRes.codecs != null ? String(videoRes.codecs) : null,
        filesize: Number(videoRes.size) || null,
      });
    }
    for (const aud of (playurl.audio_resource as Array<Record<string, unknown>>) || []) {
      if (!aud.url) continue;
      formats.push({
        format_id: `audio-${formats.length}`,
        url: String(aud.url),
        ext: 'mp4',
        abr: Number(aud.bandwidth) || null,
        acodec: aud.codecs != null ? String(aud.codecs) : null,
        vcodec: 'none',
        filesize: Number(aud.size) || null,
      });
    }
    return formats;
  }

  protected parseVideoMetadata(videoData: Record<string, unknown>): Partial<VideoInfo> {
    const titleDisplay = videoData.title_display != null ? String(videoData.title_display) : '';
    const epMatch = titleDisplay.match(/^E(\d+)(?:$| - )/);
    return {
      title: titleDisplay || (videoData.title != null ? String(videoData.title) : undefined),
      description: videoData.desc != null ? String(videoData.desc) : null,
      thumbnail: videoData.cover != null ? String(videoData.cover) : null,
      timestamp: videoData.formatted_pub_date
        ? Math.floor(Date.parse(String(videoData.formatted_pub_date)) / 1000) || null
        : null,
      episode_number: epMatch ? Number(epMatch[1]) : null,
    };
  }
}

export class BiliIntlIE extends BiliIntlBaseIE {
  static IE_NAME = 'BiliIntl';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bili(?:bili\.tv|intl\.com)\/(?:[a-zA-Z]{2}\/)?(?:play\/(?<season_id>\d+)\/(?<ep_id>\d+)|video\/(?<aid>\d+))/i;
  static _TESTS = [
    { url: 'https://www.bilibili.tv/en/play/34613/341736', only_matching: true },
    { url: 'https://bilibili.tv/en/video/2019955076', only_matching: true },
  ];

  static _make_url(videoId: string, seriesId?: string): string {
    if (seriesId) return `https://www.bilibili.tv/en/play/${seriesId}/${videoId}`;
    return `https://www.bilibili.tv/en/video/${videoId}`;
  }

  private async extractVideoMetadata(
    url: string,
    videoId: string,
    seasonId?: string,
  ): Promise<Partial<VideoInfo>> {
    const webpage = await this._download_webpage(url, videoId, undefined, {
      headers: BILI_INTL_HEADERS,
      fatal: false,
    });
    let videoData: Record<string, unknown> = {};
    if (webpage) {
      try {
        const initial = this._search_json(
          /window\.__INITIAL_(?:DATA|STATE)__\s*=/,
          webpage,
          'preload state',
          videoId,
          { fatal: false },
        ) as Record<string, unknown> | null;
        videoData =
          ((initial?.OgvVideo as Record<string, unknown>)?.epDetail as Record<string, unknown>) ||
          ((initial?.UgcVideo as Record<string, unknown>)?.videoData as Record<string, unknown>) ||
          ((initial?.ugc as Record<string, unknown>)?.archive as Record<string, unknown>) ||
          {};
      } catch {
        videoData = {};
      }
    }

    if (seasonId && !Object.keys(videoData).length) {
      const seasonJson = await this.callApi(
        `/web/v2/ogv/play/episodes?season_id=${seasonId}&platform=web`,
        videoId,
      );
      const sections = (seasonJson.sections as Array<Record<string, unknown>>) || [];
      for (const section of sections) {
        const eps = (section.episodes as Array<Record<string, unknown>>) || [];
        const found = eps.find((e) => String(e.episode_id) === videoId);
        if (found) {
          videoData = found;
          break;
        }
      }
    }

    const parsed = this.parseVideoMetadata(videoData);
    const title = webpage ? this._og_search_title(webpage) : null;
    const description = webpage ? this._og_search_description(webpage) : null;
    let ld: Record<string, unknown> = {};
    if (webpage) {
      try {
        ld = this._search_json_ld(webpage, videoId, { fatal: false });
      } catch {
        ld = {};
      }
    }
    return { ...parsed, ...ld, title: parsed.title || title || videoId, description: parsed.description || description };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const seasonId = m.groups?.season_id;
    const epId = m.groups?.ep_id;
    const aid = m.groups?.aid;
    const videoId = epId || aid || '';

    let chapters: Array<{ start_time: number; end_time: number; title: string }> | undefined;
    if (epId) {
      const introEnding = await this.callApi(
        `/web/v2/ogv/play/episode?episode_id=${epId}&platform=web`,
        videoId,
        { fatal: false },
      );
      const skip = introEnding.skip as Record<string, unknown> | undefined;
      if (skip) {
        chapters = [
          {
            start_time: Number(skip.opening_start_time) / 1000 || 0,
            end_time: Number(skip.opening_end_time) / 1000 || 0,
            title: 'Intro',
          },
          {
            start_time: Number(skip.ending_start_time) / 1000 || 0,
            end_time: Number(skip.ending_end_time) / 1000 || 0,
            title: 'Outro',
          },
        ];
      }
    }

    const metadata = await this.extractVideoMetadata(url, videoId, seasonId);
    const formats = await this.getFormats({ epId, aid });
    const subtitles = await this.getSubtitles({ epId, aid });

    return {
      id: videoId,
      ...metadata,
      formats,
      subtitles,
      chapters,
      extractor: 'BiliIntl',
      extractor_key: 'BiliIntl',
      http_headers: BILI_INTL_HEADERS,
    } as VideoInfo;
  }
}

export class BiliIntlSeriesIE extends BiliIntlBaseIE {
  static IE_NAME = 'biliIntl:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bili(?:bili\.tv|intl\.com)\/(?:[a-zA-Z]{2}\/)?(?:play|media)\/(?<id>\d+)\/?(?:[?#]|$)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.tv/en/play/34613', only_matching: true },
    { url: 'https://www.bilibili.tv/en/media/1048837', only_matching: true },
  ];

  private async* entries(seriesId: string): AsyncGenerator<VideoInfo> {
    const seriesJson = await this.callApi(
      `/web/v2/ogv/play/episodes?season_id=${seriesId}&platform=web`,
      seriesId,
    );
    for (const section of (seriesJson.sections as Array<Record<string, unknown>>) || []) {
      for (const episode of (section.episodes as Array<Record<string, unknown>>) || []) {
        const episodeId = String(episode.episode_id || '');
        if (!episodeId) continue;
        yield this.url_result(
          BiliIntlIE._make_url(episodeId, seriesId),
          'BiliIntl',
          episodeId,
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const seasonInfo = await this.callApi(
      `/web/v2/ogv/play/season_info?season_id=${seriesId}&platform=web`,
      seriesId,
    );
    const seriesInfo = (seasonInfo.season || {}) as Record<string, unknown>;

    const entries: VideoInfo[] = [];
    for await (const e of this.entries(seriesId)) entries.push(e);

    return {
      _type: 'playlist',
      id: seriesId,
      title: seriesInfo.title != null ? String(seriesInfo.title) : seriesId,
      description: seriesInfo.description != null ? String(seriesInfo.description) : null,
      entries,
      playlist_count: entries.length,
      categories:
        ((seriesInfo.styles as Array<Record<string, unknown>>) || [])
          .map((s) => (s.title != null ? String(s.title) : null))
          .filter((v): v is string => !!v) || null,
      thumbnail: seriesInfo.horizontal_cover != null ? String(seriesInfo.horizontal_cover) : null,
      view_count: Number(seriesInfo.view) || null,
      extractor: 'biliIntl:series',
      extractor_key: 'BiliIntlSeries',
    };
  }
}
