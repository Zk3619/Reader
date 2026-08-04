// @ts-nocheck
/** YahooIE / YahooSearchIE / YahooJapanNewsIE â€?ported from yt-dlp yahoo.py */

import { createHash } from 'node:crypto';

import { ExtractorError, InfoExtractor, SearchInfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  mimetype2ext,
  traverse_obj,
  try_get,
  url_or_none,
} from '../../utils';
import { extractYoutubeEmbedUrl, parse_iso8601, removeDuplicateFormats } from './_helpers';

export class YahooIE extends InfoExtractor {
  static IE_NAME = 'yahoo';
  static _VALID_URL =
    /(?<url>https?:\/\/(?:(?<country>[a-zA-Z]{2}(?:-[a-zA-Z]{2})?|malaysia)\.)?(?:[\da-zA-Z_-]+\.)?yahoo\.com\/(?:[^/]+\/)*(?<id>[^?&#]*-[0-9]+(?:-[a-z]+)?)\.html)/;

  protected async _extract_yahoo_video(
    videoId: string,
    country: string,
  ): Promise<VideoInfo> {
    const videoMeta = await this._download_json<{
      query: { results: { mediaObj: Array<{ meta: Record<string, unknown> }> } };
    }>(
      `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
      videoId,
      'Downloading video JSON metadata',
    );
    const video = videoMeta.query.results.mediaObj[0]!.meta;
    if (country === 'malaysia') country = 'my';

    const isLive = traverse_obj(video, ['uplynk_live']) === true;
    const fmts = isLive ? (['m3u8'] as const) : (['webm', 'mp4'] as const);

    const urls: string[] = [];
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    let msg: string | undefined;

    for (const fmt of fmts) {
      const mediaWrap = await this._download_json<{
        query: {
          results: {
            mediaObj: Array<{
              status?: { msg?: string };
              streams?: Array<Record<string, unknown>>;
              closedcaptions?: Array<Record<string, unknown>>;
            }>;
          };
        };
      }>(
        `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
        videoId,
        `Downloading ${fmt} JSON metadata`,
        {
          headers: this.geo_verification_headers(),
          query: { format: fmt, region: country.toUpperCase() },
        },
      );
      const mediaObj = mediaWrap.query.results.mediaObj[0]!;
      msg = mediaObj.status?.msg;

      for (const s of mediaObj.streams || []) {
        const host = s.host != null ? String(s.host) : '';
        const path = s.path != null ? String(s.path) : '';
        if (!host || !path) continue;
        const sUrl = host + path;
        if (s.format === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              sUrl,
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
          continue;
        }
        const tbr = int_or_none(s.bitrate);
        formats.push({
          url: sUrl,
          format_id: tbr != null ? `${fmt}-${tbr}` : fmt,
          width: int_or_none(s.width) ?? undefined,
          height: int_or_none(s.height) ?? undefined,
          tbr: tbr ?? undefined,
          fps: int_or_none(s.framerate) ?? undefined,
        });
      }

      for (const cc of mediaObj.closedcaptions || []) {
        const ccUrl = cc.url != null ? String(cc.url) : null;
        if (!ccUrl || urls.includes(ccUrl)) continue;
        urls.push(ccUrl);
        const lang = (cc.lang as string) || 'en-US';
        (subtitles[lang] ||= []).push({
          url: ccUrl,
          ext: mimetype2ext(cc.content_type as string) || undefined,
        });
      }
    }

    if (!formats.length && msg === 'geo restricted') {
      this.raise_geo_restricted();
    }

    let thumbnail = url_or_none(video.thumbnail) || undefined;
    if (thumbnail?.startsWith('http://')) {
      thumbnail = thumbnail.replace(/^http:\/\//, 'https://');
    }

    return {
      id: videoId,
      formats,
      subtitles,
      is_live: isLive,
      title: clean_html(video.title as string) || videoId,
      description: clean_html(video.description as string) || undefined,
      thumbnail,
      timestamp: parse_iso8601(video.publish_time) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      view_count: int_or_none(video.view_count) ?? undefined,
      series: video.show_name ? String(video.show_name) : undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const pageUrl = m.groups!.url!;
    const displayId = m.groups!.id!;
    let country = m.groups!.country || 'us';
    country = country.split('-')[0]!;

    const items = (
      await this._download_json<{
        items: Array<{
          data: { partnerData: Record<string, unknown> };
          markup?: string;
        }>;
      }>(`https://${country}.yahoo.com/caas/content/article`, displayId, 'Downloading content JSON metadata', {
        query: { url: pageUrl },
      })
    ).items[0]!;

    const item = items.data.partnerData;
    if (item.type !== 'video') {
      const entries: VideoInfo[] = [];

      const cover = (item.cover as Record<string, unknown>) || {};
      if (cover.type === 'yvideo') {
        const coverUrl = cover.url != null ? String(cover.url) : null;
        if (coverUrl) {
          entries.push(
            this.url_result(coverUrl, 'Yahoo', cover.uuid != null ? String(cover.uuid) : undefined),
          );
        }
      }

      for (const e of (item.body as Array<Record<string, unknown>>) || []) {
        if (e.type === 'videoIframe') {
          const iframeUrl = e.url != null ? String(e.url) : null;
          if (iframeUrl) entries.push(this.url_result(iframeUrl));
        }
      }

      if (item.type === 'storywithleadvideo') {
        const iframeUrl = try_get(item, (x) =>
          String(
            ((x.meta as Record<string, unknown>)?.player as Record<string, unknown>)?.url || '',
          ),
        );
        if (iframeUrl) {
          entries.push(this.url_result(iframeUrl));
        } else {
          this.report_warning(
            "Yahoo didn't provide an iframe url for this storywithleadvideo",
          );
        }
      }

      if (items.markup) {
        const ytUrl = extractYoutubeEmbedUrl(items.markup);
        if (ytUrl) entries.push(this.url_result(ytUrl));
        for (const ym of items.markup.matchAll(
          /(?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/(?:embed|v)\/[\w-]+/gi,
        )) {
          const u = ym[0].startsWith('//') ? `https:${ym[0]}` : ym[0];
          if (!entries.some((e) => e.url === u)) entries.push(this.url_result(u));
        }
      }

      return this.playlist_result(
        entries,
        item.uuid != null ? String(item.uuid) : displayId,
        item.title != null ? String(item.title) : undefined,
        item.summary != null ? String(item.summary) : undefined,
      );
    }

    const info = await this._extract_yahoo_video(String(item.uuid), country);
    info.display_id = displayId;
    return info;
  }
}

export class YahooSearchIE extends SearchInfoExtractor {
  static IE_NAME = 'yahoo:search';
  static _VALID_URL = false as const;
  static _MAX_RESULTS = 1000;
  static _SEARCH_KEY = 'yvsearch';

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    for (let pagenum = 0; entries.length < n; pagenum++) {
      const resultUrl = `https://video.search.yahoo.com/search/?p=${encodeURIComponent(query)}&fr=screen&o=js&gs=0&b=${pagenum * 30}`;
      const info = await this._download_json<{
        results?: Array<{ rurl?: string }>;
        m?: { last?: number; total?: number };
      }>(resultUrl, query, `Downloading results page ${pagenum + 1}`);
      for (const result of info.results || []) {
        if (result.rurl) entries.push(this.url_result(result.rurl));
        if (entries.length >= n) break;
      }
      if ((info.m?.last ?? 0) >= (info.m?.total ?? 0) - 1) break;
      if (!(info.results || []).length) break;
    }
    return entries.slice(0, n);
  }
}

export class YahooJapanNewsIE extends InfoExtractor {
  static IE_NAME = 'yahoo:japannews';
  static IE_DESC = 'Yahoo! Japan News';
  static _VALID_URL = /https?:\/\/news\.yahoo\.co\.jp\/(?:articles|feature)\/(?<id>[a-zA-Z0-9]+)/;
  static _GEO_COUNTRIES = ['JP'];

  protected async _extract_formats(
    jsonData: Record<string, unknown>,
    contentId: string,
  ): Promise<Format[]> {
    const formats: Format[] = [];
    const results =
      (traverse_obj(jsonData, ['ResultSet', 'Result']) as Array<Record<string, unknown>>) || [];
    for (const result of results) {
      const videoUrls =
        (traverse_obj(result, ['VideoUrlSet', 'VideoUrl']) as Array<Record<string, unknown>>) ||
        [];
      for (const vid of videoUrls) {
        const delivery = vid.delivery != null ? String(vid.delivery) : '';
        const vUrl = url_or_none(vid.Url);
        if (!delivery || !vUrl) continue;
        if (delivery === 'hls') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              vUrl,
              contentId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else {
          const bitrate = int_or_none(vid.bitrate);
          formats.push({
            url: vUrl,
            format_id: bitrate != null ? `http-${bitrate}` : 'http',
            height: int_or_none(vid.height) ?? undefined,
            width: int_or_none(vid.width) ?? undefined,
            tbr: bitrate ?? undefined,
          });
        }
      }
    }
    return removeDuplicateFormats(formats);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const preloadedState = this._search_json(
      /__PRELOADED_STATE__\s*=/,
      webpage,
      'preloaded state',
      videoId,
    ) as Record<string, unknown>;

    const paragraphs =
      (traverse_obj(preloadedState, ['articleDetail', 'paragraphs']) as Array<
        Record<string, unknown>
      >) || [];
    let contentId: number | null = null;
    for (const para of paragraphs) {
      for (const obj of (para.objectItems as Array<Record<string, unknown>>) || []) {
        const vid = (obj.video as Record<string, unknown>)?.vid;
        if (typeof vid === 'number') {
          contentId = vid;
          break;
        }
      }
      if (contentId != null) break;
    }
    if (contentId == null) {
      throw new ExtractorError('This article does not contain a video', { expected: true });
    }

    const HOST = 'news.yahoo.co.jp';
    const spaceId = traverse_obj(preloadedState, ['pageData', 'spaceId']) as string | undefined;
    const jsonData = await this._download_json<Record<string, unknown>>(
      `https://feapi-yvpub.yahooapis.jp/v1/content/${contentId}`,
      videoId,
      undefined,
      {
        query: {
          appid: 'dj0zaiZpPVZMTVFJR0FwZWpiMyZzPWNvbnN1bWVyc2VjcmV0Jng9YjU-',
          output: 'json',
          domain: HOST,
          ak: spaceId
            ? createHash('md5').update(`${spaceId}_${HOST}`).digest('hex')
            : '',
          device_type: '1100',
        },
      },
    );

    const title =
      (traverse_obj(preloadedState, ['articleDetail', 'headline']) as string) ||
      (traverse_obj(preloadedState, ['pageData', 'pageParam', 'title']) as string) ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
      this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', null, false) ||
      videoId;

    const description =
      (traverse_obj(preloadedState, ['pageData', 'description']) as string) ||
      this._html_search_meta(
        ['og:description', 'description', 'twitter:description'],
        webpage,
      ) ||
      undefined;

    const thumbnail =
      (traverse_obj(preloadedState, ['pageData', 'ogpImage']) as string) ||
      this._og_search_thumbnail(webpage) ||
      this._html_search_meta('twitter:image', webpage) ||
      undefined;

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      formats: await this._extract_formats(jsonData, videoId),
    };
  }
}
