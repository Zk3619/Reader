/** NYTimes* — ported from yt-dlp nytimes.py (GraphQL main path; article simplified) */

import { createHash } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  remove_end,
  str_or_none,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // placeholder namespace seed
const NYT_TOKEN =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuNIzKBOFB77aT/jN/FQ+/QVKWq5V1ka1AYmCR9hstz1pGNPH5ajOU9gAqta0T89iPnhjwla+3oec/Z3kGjxbpv6miQXufHFq3u2RC6HyU458cLat5kVPSOQCe3VVB5NRpOlRuwKHqn0txfxnwSSj8mqzstR997d3gKB//RO9zE16y3PoWlDQXkASngNJEWvL19iob/xwAkfEWCjyRILWFY0JYX3AvLMSbq7wsqOCE5srJpo7rRU32zsByhsp1D5W9OYqqwDmflsgCEQy2vqTsJjrJohuNg+urMXNNZ7Y3naMoqttsGDrWVxtPBafKMI8pM2ReNZBbGQsQXRzQNo7+QIDAQAB';

function uuidV5(name: string, namespaceSeed: string): string {
  const ns = createHash('sha1').update(namespaceSeed).digest().subarray(0, 16);
  ns[6] = (ns[6]! & 0x0f) | 0x50;
  ns[8] = (ns[8]! & 0x3f) | 0x80;
  const nameBytes = new TextEncoder().encode(name);
  const payload = new Uint8Array(ns.length + nameBytes.length);
  payload.set(ns, 0);
  payload.set(nameBytes, ns.length);
  const hash = createHash('sha1').update(payload).digest();
  const bytes = hash.subarray(0, 16);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nytMediaUuid(mediaId: string): string {
  const videoNs = uuidV5('video', DNS_NAMESPACE);
  return uuidV5(mediaId, videoNs);
}

const GRAPHQL_QUERY = `query VideoQuery($id: String!) {
  video(id: $id) {
    ... on Video {
      bylines { renderedRepresentation }
      duration
      firstPublished
      promotionalHeadline
      promotionalMedia {
        ... on Image {
          crops { name renditions { name width height url } }
        }
      }
      renditions { type width height url bitrate }
      summary
    }
  }
}`;

export class NYTimesBaseIE extends InfoExtractor {
  static IE_NAME = 'NYTimesBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _GRAPHQL_API = 'https://samizdat-graphql.nytimes.com/graphql/v2';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NYTimesBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(mediaId: string): Promise<Record<string, unknown>> {
    const mediaUuid = nytMediaUuid(mediaId);
    const resp = await this._download_json<{ data?: { video?: Record<string, unknown> } }>(
      NYTimesBaseIE._GRAPHQL_API,
      mediaId,
      'Downloading JSON from GraphQL API',
      {
        method: 'POST',
        data: JSON.stringify({ query: GRAPHQL_QUERY, variables: { id: `nyt://video/${mediaUuid}` } }),
        headers: {
          'Content-Type': 'application/json',
          'Nyt-App-Type': 'vhs',
          'Nyt-App-Version': 'v3.52.21',
          'Nyt-Token': NYT_TOKEN,
          Origin: 'https://nytimes.com',
        },
        fatal: false,
      },
    );
    return (resp.data?.video as Record<string, unknown>) || {};
  }

  protected _extractThumbnails(renditions: unknown): Thumbnail[] | undefined {
    const thumbs: Thumbnail[] = [];
    for (const r of (renditions as Array<Record<string, unknown>>) || []) {
      const u = url_or_none(r.url);
      if (u) thumbs.push({ url: u, width: int_or_none(r.width) ?? undefined, height: int_or_none(r.height) ?? undefined });
    }
    return thumbs.length ? thumbs : undefined;
  }

  protected async _extractFormatsAndSubtitles(
    mediaId: string,
    data: Record<string, unknown>,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const seen = new Set<string>();
    for (const video of (data.renditions as Array<Record<string, unknown>>) || []) {
      const videoUrl = str_or_none(video.url);
      const formatId = str_or_none(video.type);
      if (!videoUrl || formatId === 'thumbs' || seen.has(videoUrl)) continue;
      seen.add(videoUrl);
      const ext = mimetype2ext(String(video.mimetype ?? '')) || determine_ext(videoUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, mediaId, 'mp4', 'm3u8_native', undefined, undefined, formatId || 'hls', undefined, false)),
        );
      } else if (ext !== 'mpd') {
        formats.push({
          url: videoUrl,
          format_id: formatId || ext,
          width: int_or_none(video.width) ?? undefined,
          height: int_or_none(video.height) ?? undefined,
          tbr: int_or_none(video.bitrate, 1000) ?? undefined,
          ext,
        });
      }
    }
    return { formats, subtitles };
  }

  protected async _extractVideo(mediaId: string): Promise<VideoInfo> {
    const data = await this._callApi(mediaId);
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(mediaId, data);
    const creators = ((data.bylines as Array<{ renderedRepresentation?: string }>) || [])
      .map((b) => (b.renderedRepresentation || '').replace(/^By /, ''))
      .filter(Boolean);
    return {
      id: mediaId,
      title: str_or_none(data.promotionalHeadline) ?? undefined,
      description: str_or_none(data.summary) ?? undefined,
      timestamp: parseIso8601(data.firstPublished) ?? undefined,
      duration: float_or_none(data.duration, 1000) ?? undefined,
      creator: creators.join(', ') || undefined,
      formats,
      subtitles,
      thumbnails: this._extractThumbnails(
        ((data.promotionalMedia as Record<string, unknown>)?.crops as Array<{ renditions?: unknown }>)?.flatMap(
          (c) => (c.renditions as unknown[]) || [],
        ),
      ),
    };
  }
}

export class NYTimesIE extends NYTimesBaseIE {
  static IE_NAME = 'NYTimes';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?nytimes\.com\/video\/(?:[^/]+\/+?|graphics8\.nytimes\.com\/bcvideo\/\d+(?:\.\d+)?\/iframe\/embed\.html\?videoId=))(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this._extractVideo(videoId);
  }
}

export class NYTimesArticleIE extends NYTimesBaseIE {
  static IE_NAME = 'NYTimesArticle';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nytimes\.com\/\d{4}\/\d{2}\/\d{2}\/(?!books|podcasts)[^/?#]+\/(?:\w+\/)?(?<id>[^./?#]+)(?:\.html)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const preloaded = this._search_json<{ initialData?: { data?: { article?: Record<string, unknown> } } }>(
      /window\.__preloadedData\s*=/,
      webpage,
      'media details',
      pageId,
    )!;
    const article = preloaded.initialData?.data?.article || {};
    const content = ((article.sprinkledBody as Record<string, unknown>)?.content as Array<Record<string, unknown>>) || [];

    const blocks: Record<string, unknown>[] = [];
    for (const block of content) {
      const media = block.ledeMedia as Record<string, unknown> | undefined;
      if (media && (media.__typename === 'Video' || media.__typename === 'Audio')) {
        if (!media.sourceId) media.sourceId = article.sourceId;
        blocks.push(media);
      }
      if (block.media && ((block.media as Record<string, unknown>).__typename === 'Video' || (block.media as Record<string, unknown>).__typename === 'Audio')) {
        blocks.push(block.media as Record<string, unknown>);
      }
    }
    if (!blocks.length) throw new ExtractorError('Unable to extract any media blocks from webpage', { expected: true });

    const commonInfo = {
      title: remove_end(this._og_search_title(webpage) || pageId, ' - The New York Times'),
      description: this._html_search_meta(['og:description', 'twitter:description'], webpage) || undefined,
      timestamp: parseIso8601(article.firstPublished) ?? undefined,
    };

    const entries: VideoInfo[] = [];
    for (const block of blocks) {
      const mediaId = str_or_none(block.sourceId);
      if (mediaId) {
        entries.push({ ...(await this._extractVideo(mediaId)), ...commonInfo });
      } else if (block.fileUrl) {
        entries.push({
          id: pageId,
          url: String(block.fileUrl),
          ext: 'mp3',
          vcodec: 'none',
          ...commonInfo,
        });
      }
    }

    if (entries.length > 1) return this.playlist_result(entries, pageId, commonInfo.title, commonInfo.description);
    return { ...entries[0]!, id: entries[0]?.id ?? pageId };
  }
}

export class NYTimesCookingIE extends NYTimesBaseIE {
  static IE_NAME = 'NYTimesCookingGuide';
  static _VALID_URL = /https?:\/\/cooking\.nytimes\.com\/guides\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const title = this._html_search_meta(['og:title', 'twitter:title'], webpage) || pageId;
    const description = this._html_search_meta(['og:description', 'twitter:description'], webpage) || undefined;
    const leadVideoId = this._search_regex(/data-video-player-id="(\d+)"/, webpage, 'lead video')!;
    const mediaIds = [
      ...[...webpage.matchAll(/data-video-id="(\d+)"/g)].map((m) => m[1]!),
      leadVideoId,
    ].filter(Boolean) as string[];
    const uniqueIds = [...new Set(mediaIds)];
    if (uniqueIds.length > 1) {
      const entries = await Promise.all(uniqueIds.map((id) => this._extractVideo(id)));
      return this.playlist_result(entries, pageId, title, description);
    }
    return { ...(await this._extractVideo(leadVideoId)), title, description };
  }
}

export class NYTimesCookingRecipeIE extends NYTimesBaseIE {
  static IE_NAME = 'NYTimesCookingRecipe';
  static _VALID_URL = /https?:\/\/cooking\.nytimes\.com\/recipes\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const recipeId = this._match_id(url);
    const webpage = await this._download_webpage(url, recipeId);
    const videoId = this._search_regex(/data-video-id="(\d+)"/, webpage, 'video id', null, false);
    if (!videoId) throw new ExtractorError('No video on recipe page', { expected: true });
    const info = await this._extractVideo(videoId);
    return {
      ...info,
      id: recipeId,
      title: this._html_search_meta(['og:title', 'twitter:title'], webpage) || info.title,
      description: this._html_search_meta(['og:description', 'twitter:description'], webpage) || info.description,
    };
  }
}
