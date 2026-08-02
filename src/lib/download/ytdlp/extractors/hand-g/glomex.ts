/**
 * Glomex family — ported from yt-dlp glomex.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  int_or_none,
  parse_qs,
  smuggle_url,
  unescapeHTML,
  unsmuggle_url,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class GlomexBaseIE extends InfoExtractor {
  static IE_NAME = 'glomexbase';
  static _VALID_URL: RegExp | string | false | null = false;

  static _DEFAULT_ORIGIN_URL = 'https://player.glomex.com/';
  static _API_URL = 'https://integration-cloudfront-eu-west-1.mes.glomex.cloud/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('GlomexBaseIE is not a standalone extractor', { expected: true });
  }

  static _smuggleOriginUrl(url: string, originUrl?: string | null): string {
    if (!originUrl) return url;
    return smuggle_url(url, { origin: originUrl });
  }

  static _unsmuggleOriginUrl(url: string, fallbackOriginUrl?: string): [string, string] {
    const [unsmuggled, data] = unsmuggle_url(url, {
      origin: fallbackOriginUrl || GlomexBaseIE._DEFAULT_ORIGIN_URL,
    });
    return [unsmuggled, String(data.origin || fallbackOriginUrl || GlomexBaseIE._DEFAULT_ORIGIN_URL)];
  }

  protected _getVideoIdType(videoId: string): string {
    const types: Record<string, string> = {
      v: 'video',
      pl: 'playlist',
      rl: 'related videos playlist',
      cl: 'curated playlist',
    };
    return types[videoId.split('-')[0]!] || 'unknown type';
  }

  protected async _downloadApiData(videoId: string, integration: string, currentUrl?: string | null) {
    const videoIdType = this._getVideoIdType(videoId);
    return this._download_json<{ videos?: Array<Record<string, unknown>> }>(
      GlomexBaseIE._API_URL,
      videoId,
      `Downloading ${videoIdType} JSON`,
      {
        query: {
          integration_id: integration,
          playlist_id: videoId,
          current_url: currentUrl || GlomexBaseIE._DEFAULT_ORIGIN_URL,
        },
      },
    );
  }

  protected async _downloadAndExtractApiData(
    videoId: string,
    integration: string,
    currentUrl: string,
  ): Promise<VideoInfo> {
    const apiData = await this._downloadApiData(videoId, integration, currentUrl);
    const videos = apiData.videos || [];
    if (!videos.length) throw new ExtractorError(`no videos found for ${videoId}`);
    const extracted = await Promise.all(videos.map((video) => this._extractApiData(video, videoId)));
    return extracted.length === 1 ? extracted[0]! : this.playlist_result(extracted, videoId);
  }

  protected async _extractApiData(video: Record<string, unknown>, videoId: string): Promise<VideoInfo> {
    if (video.error_code === 'contentGeoblocked') {
      this.raise_geo_restricted(undefined, video.geo_locations as string[] | undefined);
    }

    const formats: VideoInfo['formats'] = [];
    const subtitles: VideoInfo['subtitles'] = {};
    const source = (video.source as Record<string, string>) || {};
    for (const [formatId, formatUrl] of Object.entries(source)) {
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, formatId);
        formats.push(...fmts);
        for (const [lang, tracks] of Object.entries(subs || {})) {
          (subtitles[lang] ||= []).push(...tracks);
        }
      } else {
        formats.push({ url: formatUrl, format_id: formatId });
      }
    }
    if (video.language) {
      for (const fmt of formats) fmt.language = video.language as string;
    }

    const images = [...((video.images as Array<Record<string, unknown>>) || []), (video.image as Record<string, unknown>) || {}];
    const thumbnails: Thumbnail[] = [];
    const seen = new Set<string>();
    for (const image of images) {
      const base = image.url as string | undefined;
      if (!base || seen.has(base)) continue;
      seen.add(base);
      thumbnails.push({ id: image.id as string | undefined, url: `${base}/profile:player-960x540`, width: 960, height: 540 });
    }

    return {
      id: String(video.clip_id ?? videoId),
      title: video.title as string | undefined,
      description: video.description as string | undefined,
      thumbnails,
      duration: int_or_none(video.clip_duration) ?? undefined,
      timestamp: video.created_at as number | undefined,
      formats,
      subtitles,
    };
  }
}

export class GlomexIE extends GlomexBaseIE {
  static IE_NAME = 'glomex';
  static IE_DESC = 'Glomex videos';
  static _VALID_URL = /https?:\/\/video\.glomex\.com\/[^/]+\/(?<id>v-[^-]+)/;
  static _INTEGRATION_ID = '19syy24xjn1oqlpc';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(
      GlomexEmbedIE.buildPlayerUrl(videoId, GlomexIE._INTEGRATION_ID, url),
      'GlomexEmbed',
      videoId,
    );
  }
}

export class GlomexEmbedIE extends GlomexBaseIE {
  static IE_NAME = 'glomex:embed';
  static IE_DESC = 'Glomex embedded videos';
  static _BASE_PLAYER_URL = '//player.glomex.com/integration/1/iframe-player.html';
  static _VALID_URL =
    /https?:\/\/player\.glomex\.com\/integration\/[^/]+\/iframe-player\.html\?([^#]+&)?playlistId=(?<id>[^#&]+)/;

  static buildPlayerUrl(videoId: string, integration: string, originUrl?: string | null): string {
    const query = new URLSearchParams({ playlistId: videoId, integrationId: integration }).toString();
    return GlomexBaseIE._smuggleOriginUrl(`https:${GlomexEmbedIE._BASE_PLAYER_URL}?${query}`, originUrl);
  }

  static extractEmbedUrls(url: string, webpage: string): string[] {
    const urls: string[] = [];
    const iframeRe =
      /<iframe[^>]+?src=(["'])(?<embed>(?:https?:)?\/\/player\.glomex\.com\/integration\/[^/]+\/iframe-player\.html\?(?:(?!\1).)+)\1/gi;
    for (const m of webpage.matchAll(iframeRe)) {
      const embedUrl = unescapeHTML(m.groups!.embed!);
      urls.push(GlomexBaseIE._smuggleOriginUrl(embedUrl, url));
    }

    const widgetRe =
      /<(?:glomex-player [^>]+?>|div[^>]* data-glomex-player=(["'])true\1[^>]*>)/gi;
    for (const m of webpage.matchAll(widgetRe)) {
      const attrs = extract_attributes(m[0]!);
      if (attrs['data-integration-id'] && attrs['data-playlist-id']) {
        urls.push(GlomexEmbedIE.buildPlayerUrl(attrs['data-playlist-id'], attrs['data-integration-id'], url));
      }
    }

    for (const scriptMatch of webpage.matchAll(/<script[^<]*>[\s\S]*?<\/script>/gi)) {
      const script = scriptMatch[0]!;
      const integrationMatch = /(?:dataset\.)?integrationId\s*(?:=|:)\s*(["'])(?<id>(?:(?!\1).)+)\1/.exec(script);
      if (!integrationMatch?.groups?.id) continue;
      const playlistMatch = /(?:dataset\.)?playlistId\s*(?:=|:)\s*(["'])(?<id>(?:(?!\1).)+)\1/.exec(script);
      if (playlistMatch?.groups?.id) {
        urls.push(GlomexEmbedIE.buildPlayerUrl(playlistMatch.groups.id, integrationMatch.groups.id, url));
      }
    }
    return urls;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, originUrl] = GlomexBaseIE._unsmuggleOriginUrl(url);
    const playlistId = this._match_id(cleanUrl);
    const integration = parse_qs(cleanUrl).integrationId?.[0];
    if (!integration) throw new ExtractorError('No integrationId in URL', { expected: true });
    return this._downloadAndExtractApiData(playlistId, integration, originUrl);
  }
}
