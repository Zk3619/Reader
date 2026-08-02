/** RedBullTV* — ported from yt-dlp redbulltv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { float_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class RedBullTVIE extends InfoExtractor {
  static IE_NAME = 'RedBullTV';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?redbull(?:\.tv|\.com(?:\/[^/]+)?(?:\/tv)?)(?:\/events\/[^/]+)?\/(?:videos?|live|(?:film|episode)s)\/(?<id>AP-\w+)/;

  async extractInfo(videoId: string): Promise<VideoInfo> {
    const session = await this._download_json<{ code?: string; message?: string; token?: string }>(
      'https://api.redbull.tv/v3/session',
      videoId,
      'Downloading access token',
      { query: { category: 'personal_computer', os_family: 'http' } },
    );
    if (session.code === 'error') {
      throw new ExtractorError(`${RedBullTVIE.IE_NAME} said: ${session.message}`, { expected: true });
    }
    const token = session.token!;

    let video: Record<string, unknown>;
    try {
      video = await this._download_json<Record<string, unknown>>(
        `https://api.redbull.tv/v3/products/${videoId}`,
        videoId,
        'Downloading video information',
        { headers: { Authorization: token } },
      );
    } catch (e) {
      const status = (e as { cause?: { status?: number } }).cause?.status;
      if (status === 404) {
        throw new ExtractorError(`${RedBullTVIE.IE_NAME} said: not found`, { expected: true });
      }
      throw e;
    }

    let title = String(video.title || '').trim();
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `https://dms.redbull.tv/v3/${videoId}/${token}/playlist.m3u8`,
      videoId,
      'hls',
    );

    for (const resource of (video.resources as string[]) || []) {
      if (resource.startsWith('closed_caption_')) {
        const parts = resource.split('_');
        if (parts[2]) {
          mergeSubtitles(subtitles as Record<string, Subtitle[]>, {
            en: [{ url: `https://resources.redbull.tv/${videoId}/${resource}`, ext: parts[2] }],
          });
        }
      }
    }

    const subheading = video.subheading as string | undefined;
    if (subheading) title += ` - ${subheading}`;

    return {
      id: videoId,
      title,
      description: (video.long_description as string) || (video.short_description as string) || undefined,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      formats,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this.extractInfo(this._match_id(url));
  }
}

export class RedBullEmbedIE extends InfoExtractor {
  static IE_NAME = 'RedBullEmbed';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?redbull\.com\/embed\/(?<id>rrn:content:[^:]+:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}:[a-z]{2}-[A-Z]{2,3})/;
  static _VIDEO_ESSENCE_TMPL = `... on %s {
      videoEssence {
        attributes
      }
    }`;

  async _real_extract(url: string): Promise<VideoInfo> {
    const rrnId = this._match_id(url);
    const tmpl = RedBullEmbedIE._VIDEO_ESSENCE_TMPL;
    const resp = await this._download_json<Record<string, unknown>>(
      'https://edge-graphql.crepo-production.redbullaws.com/v1/graphql',
      rrnId,
      undefined,
      {
        headers: { Accept: 'application/json', 'API-KEY': 'e90a1ff11335423998b100c929ecc866' },
        query: {
          query: `{
  resource(id: "${rrnId}", enforceGeoBlocking: false) {
    ${tmpl.replace('%s', 'LiveVideo')}
    ${tmpl.replace('%s', 'VideoResource')}
  }
}`,
        },
      },
    );
    const assetId = (
      (((resp.data as Record<string, unknown>).resource as Record<string, unknown>).videoEssence as Record<string, unknown>)
        .attributes as Record<string, unknown>
    ).assetId as string;
    return new RedBullTVIE().extractInfo(assetId);
  }
}

export class RedBullTVRrnContentIE extends InfoExtractor {
  static IE_NAME = 'RedBullTVRrnContent';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?redbull\.com\/(?<region>[a-z]{2,3})-(?<lang>[a-z]{2})\/tv\/(?:video|live|film)\/(?<id>rrn:content:[^:]+:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const rrnId = `${m.groups!.id}:${m.groups!.lang}-${m.groups!.region!.toUpperCase()}`;
    return this.url_result(`https://www.redbull.com/embed/${rrnId}`, 'RedBullEmbed', rrnId);
  }
}

const INT_FALLBACK_LIST = ['de', 'en', 'es', 'fr'];
const LAT_FALLBACK_MAP = ['ar', 'bo', 'car', 'cl', 'co', 'mx', 'pe'];

export class RedBullIE extends InfoExtractor {
  static IE_NAME = 'RedBull';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?redbull\.com\/(?<region>[a-z]{2,3})-(?<lang>[a-z]{2})\/(?<type>(?:episode|film|(?:(?:recap|trailer)-)?video)s|live)\/(?!AP-|rrn:content:)(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let region = m.groups!.region!;
    const lang = m.groups!.lang!;
    let filterType = m.groups!.type!;
    const displayId = m.groups!.id!;

    if (filterType === 'episodes') filterType = 'episode-videos';
    else if (filterType === 'live') filterType = 'live-videos';

    const regions = [region.toUpperCase()];
    if (region !== 'int') {
      if (LAT_FALLBACK_MAP.includes(region)) regions.push('LAT');
      if (INT_FALLBACK_LIST.includes(lang)) regions.push('INT');
    }
    const locale = regions.map((reg) => `${lang}-${reg}`).join('>');

    const resp = await this._download_json<{ data?: { id?: string } }>(
      `https://www.redbull.com/v3/api/graphql/v1/v3/query/${locale}`,
      displayId,
      undefined,
      { query: { 'filter[type]': filterType, 'filter[uriSlug]': displayId, rb3Schema: 'v1:hero' } },
    );
    const rrnId = resp.data?.id;
    if (!rrnId) throw new ExtractorError('Unable to resolve Red Bull content id');
    return this.url_result(`https://www.redbull.com/embed/${rrnId}`, 'RedBullEmbed', rrnId);
  }
}
