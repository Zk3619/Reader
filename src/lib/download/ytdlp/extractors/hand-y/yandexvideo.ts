// @ts-nocheck
/**
 * YandexVideo* / ZenYandex* IEs �?ported from yt-dlp yandexvideo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  parse_qs,
  traverse_obj,
  try_get,
  unescapeHTML,
  update_url_query,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  qualities,
} from './_helpers';

function lowercaseEscape(s: string): string {
  return unescapeHTML(
    s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
  );
}

export class YandexVideoIE extends InfoExtractor {
  static IE_NAME = 'YandexVideo';
  static _VALID_URL =
    /https?:\/\/(?:yandex\.ru(?:\/(?:portal\/(?:video|efir)|efir))?\/?\?.*?stream_id=|frontend\.vh\.yandex\.ru\/player\/)(?<id>(?:[\da-f]{32}|[\w-]{12}))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    let player: Record<string, unknown> | null = null;
    const gql = await this._download_json<{
      player?: { content?: Record<string, unknown> };
    }>(
      'https://frontend.vh.yandex.ru/graphql',
      videoId,
      undefined,
      {
        data: `{
  player(content_id: "${videoId}") {
    computed_title
    content_url
    description
    dislikes
    duration
    likes
    program_title
    release_date
    release_date_ut
    release_year
    restriction_age
    season
    start_time
    streams
    thumbnail
    title
    views_count
  }
}`,
        fatal: false,
      },
    );
    player = try_get(gql, (x) => x.player?.content as Record<string, unknown>) || null;

    if (!player || player.error) {
      player = await this._download_json<Record<string, unknown>>(
        `https://frontend.vh.yandex.ru/v23/player/${videoId}.json`,
        videoId,
        undefined,
        { query: { stream_options: 'hires', disable_trackings: '1' } },
      );
    }
    const content = (player.content as Record<string, unknown>) || player;

    const title = String(content.title || content.computed_title || videoId);

    const formats: Format[] = [];
    const streams = [...((content.streams as Array<Record<string, unknown>>) || [])];
    streams.push({ url: content.content_url });
    for (const stream of streams) {
      const contentUrl = url_or_none(stream.url);
      if (!contentUrl) continue;
      const ext = determine_ext(contentUrl);
      if (ext === 'ismc') continue;
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            contentUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else if (ext === 'mpd') {
        formats.push(
          ...(await this._extract_mpd_formats(contentUrl, videoId, 'dash', undefined, false)),
        );
      } else {
        formats.push({ url: contentUrl });
      }
    }

    const timestamp =
      int_or_none(content.release_date) ??
      int_or_none(content.release_date_ut) ??
      int_or_none(content.start_time);
    const season = (content.season as Record<string, unknown>) || {};

    return {
      id: videoId,
      title,
      description: content.description != null ? String(content.description) : undefined,
      thumbnail: content.thumbnail != null ? String(content.thumbnail) : undefined,
      timestamp: timestamp ?? undefined,
      duration: int_or_none(content.duration) ?? undefined,
      series: content.program_title != null ? String(content.program_title) : undefined,
      age_limit: int_or_none(content.restriction_age) ?? undefined,
      view_count: int_or_none(content.views_count) ?? undefined,
      like_count: int_or_none(content.likes) ?? undefined,
      dislike_count: int_or_none(content.dislikes) ?? undefined,
      season_number: int_or_none(season.season_number) ?? undefined,
      season_id: season.id != null ? String(season.id) : undefined,
      release_year: int_or_none(content.release_year) ?? undefined,
      formats,
    };
  }
}

export class YandexVideoPreviewIE extends InfoExtractor {
  static IE_NAME = 'YandexVideoPreview';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?yandex\.\w{2,3}(?:\.(?:am|ge|il|tr))?\/video\/preview(?:\/?\?.*?filmId=|\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const dataRaw = this._search_regex(
      /window\.Ya\.__inline_params__\s*=\s*JSON\.parse\('([^"]+?\\u0022video\\u0022:[^"]+?})'\);/,
      webpage,
      'data_raw',
    );
    const dataJson = this._parse_json(dataRaw!, videoId, lowercaseEscape) as {
      video?: { url?: string };
    };
    const videoUrl = dataJson.video?.url;
    if (!videoUrl) throw new ExtractorError('Unable to extract video URL');
    return this.url_result(videoUrl);
  }
}

export class ZenYandexBaseIE extends InfoExtractor {
  static IE_NAME = 'dzen.ru:base';
  static _VALID_URL = false as const;

  protected async _fetch_ssr_data(
    url: string,
    videoId: string,
  ): Promise<[string, Record<string, unknown>]> {
    let webpage = await this._download_webpage(url, videoId);
    const redirectObj = this._search_json(
      /(?:var|let|const)\s+it\s*=/,
      webpage,
      'redirect',
      videoId,
      { default: {} },
    ) as Record<string, unknown>;
    const redirect = redirectObj.retpath != null ? String(redirectObj.retpath) : null;
    if (redirect) {
      try {
        videoId = this._match_id(redirect);
      } catch {
        /* keep */
      }
      webpage = await this._download_webpage(redirect, videoId, 'Redirecting');
    }
    const paramsRaw = this._search_regex(
      /(?:var|let|const)\s+_params\s*=\s*\((\{[\s\S]*?\})\)\s*;/,
      webpage,
      'metadata',
      null,
      false,
    );
    const params = paramsRaw
      ? ((this._parse_json(paramsRaw, videoId, null, false) as Record<string, unknown>) || {})
      : {};
    return [videoId, (params.ssrData as Record<string, unknown>) || {}];
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ZenYandexBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ZenYandexIE extends ZenYandexBaseIE {
  static IE_NAME = 'dzen.ru';
  static IE_DESC = 'Дзен (dzen) formerly Яндекс.Дзен (Yandex Zen)';
  static _VALID_URL =
    /https?:\/\/(zen\.yandex|dzen)\.ru(?:\/video)?\/(media|watch)\/(?:(?:id\/[^/]+\/|[^/]+\/)(?:[a-z0-9-]+)-)?(?<id>[a-z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    let ssrData: Record<string, unknown>;
    [videoId, ssrData] = await this._fetch_ssr_data(url, videoId);
    const videoData = (ssrData.videoMetaResponse as Record<string, unknown>) || {};

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const quality = qualities(['4', '0', '1', '2', '3', '5', '6', '7']);

    const streamUrls = new Set<string>();
    const video = (videoData.video as Record<string, unknown>) || {};
    const candidates: unknown[] = [
      video.id,
      ...((video.streams as unknown[]) || []),
      ...(((video.mp4Streams as Array<Record<string, unknown>>) || []).map((s) => s.url)),
      ...(((video.oneVideoStreams as Array<Record<string, unknown>>) || []).map((s) => s.url)),
    ];
    for (const c of candidates) {
      const u = url_or_none(c);
      if (!u) continue;
      streamUrls.add(update_url_query(u, { dzen_dash: [] as never }));
    }

    for (const sUrl of streamUrls) {
      const ext = determine_ext(sUrl);
      const contentType = (parse_qs(sUrl).ct || [])[0];
      if (ext === 'mpd' || contentType === '6') {
        const { formats: fmts, subtitles: subs } = await extractMpdFormatsAndSubtitles(
          this,
          sUrl,
          videoId,
          'dash',
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (ext === 'm3u8' || contentType === '8') {
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
          this,
          sUrl,
          videoId,
          'hls',
        );
        formats.push(...fmts);
        mergeSubtitles(subtitles, subs);
      } else if (contentType === '0') {
        const formatType = (parse_qs(sUrl).type || [])[0];
        formats.push({
          url: sUrl,
          format_id: formatType,
          ext: 'mp4',
          quality: formatType ? quality(formatType) : undefined,
        });
      } else {
        this.report_warning(`Unsupported stream URL: ${sUrl}`);
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: videoData.title != null ? String(videoData.title) : videoId,
      description: videoData.description != null ? String(videoData.description) : undefined,
      thumbnail: url_or_none(videoData.image) || undefined,
      duration: int_or_none(video.duration) ?? undefined,
      view_count: int_or_none(video.views) ?? undefined,
      timestamp: int_or_none(videoData.publicationDate) ?? undefined,
      tags: Array.isArray(videoData.tags)
        ? (videoData.tags as unknown[]).map(String)
        : undefined,
      uploader: traverse_obj(videoData, ['source', 'title']) as string | undefined,
    };
  }
}

export class ZenYandexChannelIE extends ZenYandexBaseIE {
  static IE_NAME = 'dzen.ru:channel';
  static _VALID_URL =
    /https?:\/\/(zen\.yandex|dzen)\.ru\/(?!media|video)(?:id\/)?(?<id>[a-z0-9-_]+)/;

  protected async _entries(
    feedData: Record<string, unknown>,
    channelId: string,
  ): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    let nextPageId: string | null = null;
    let data = feedData;

    for (let page = 1; page < 100; page++) {
      const items: Array<Record<string, unknown>> = [];
      const topItems = (data.items as Array<Record<string, unknown>>) || [];
      for (const item of topItems) {
        if (item.tab === 'shorts' || item.tab === 'longs') {
          items.push(...((item.items as Array<Record<string, unknown>>) || []));
        } else if (url_or_none(item.link)) {
          items.push(item);
        }
      }
      // also nested items without tab
      for (const group of topItems) {
        for (const item of (group.items as Array<Record<string, unknown>>) || []) {
          if (url_or_none(item.link)) items.push(item);
        }
      }

      const seen = new Set<string>();
      for (const item of items) {
        const link = url_or_none(item.link);
        if (!link || seen.has(link)) continue;
        seen.add(link);
        entries.push(
          this.url_result(
            link,
            ZenYandexIE.IE_NAME,
            item.id != null ? String(item.id) : undefined,
            item.title != null ? String(item.title) : undefined,
          ),
        );
      }

      const more = url_or_none(traverse_obj(data, ['more', 'link']));
      const currentPageId = nextPageId;
      nextPageId = (parse_qs(more || '').next_page_id || []).slice(-1)[0] || null;
      if (!more || !nextPageId || nextPageId === currentPageId) break;

      data = await this._download_json<Record<string, unknown>>(
        more,
        channelId,
        `Downloading Page ${page}`,
      );
    }

    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let channelId = this._match_id(url);
    let ssrData: Record<string, unknown>;
    [channelId, ssrData] = await this._fetch_ssr_data(url, channelId);
    const channelData = (ssrData.exportResponse as Record<string, unknown>) || {};
    const source =
      (traverse_obj(channelData, ['channel', 'source']) as Record<string, unknown>) || {};

    return this.playlist_result(
      await this._entries(
        (channelData.feedData as Record<string, unknown>) || {},
        channelId,
      ),
      channelId,
      source.title != null ? String(source.title) : undefined,
      source.description != null ? String(source.description) : undefined,
    );
  }
}
