/**
 * AppleConnectIE / ApplePodcastsIE — aligned with yt-dlp appleconnect.py / applepodcasts.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './helpers';

const jwtCache: Record<string, string> = {};

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function jwtExpired(token: string): boolean {
  const exp = decodeJwtPayload(token).exp;
  return typeof exp === 'number' ? exp - Date.now() / 1000 < 120 : true;
}

abstract class AppleBaseIE extends InfoExtractor {
  protected _BASE_URL = '';
  protected _JWT_KEY_ID = '';

  protected async getToken(webpage: string, episodeId: string): Promise<string> {
    const cached = jwtCache[this._BASE_URL];
    if (cached && !jwtExpired(cached)) return cached;

    const jsPath = this._search_regex(
      /<script [^>]*\bsrc="(\/assets\/index~[0-9a-f]+\.js)"/,
      webpage,
      'JS asset path',
    );
    if (!jsPath) throw new ExtractorError('Unable to find Apple JS asset path', { expected: true });

    const jsCode = await this._download_webpage(`${this._BASE_URL}${jsPath}`, episodeId, 'Downloading JS asset');
    const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256', kid: this._JWT_KEY_ID }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = this._search_regex(
      new RegExp(`(["'])(?<jwt>${header}(?:\\.[\\w-]+){2})\\1`),
      jsCode,
      'JSON Web Token',
      null,
      true,
      'jwt',
    );
    if (!token || jwtExpired(token)) throw new ExtractorError('The fetched token is already expired', { expected: true });
    jwtCache[this._BASE_URL] = token;
    return token;
  }
}

export class AppleConnectIE extends AppleBaseIE {
  static IE_NAME = 'apple:music:connect';
  static IE_DESC = 'Apple Music Connect';
  static _VALID_URL = /https?:\/\/music\.apple\.com\/[\w-]+\/post\/(?<id>\d+)/;

  protected _BASE_URL = 'https://music.apple.com';
  protected _JWT_KEY_ID = 'WebPlayKid';

  private static _QUALITIES: Record<string, number | null> = {
    provisionalUploadVideo: null,
    sdVideo: 480,
    sdVideoWithPlusAudio: 480,
    sd480pVideo: 480,
    '720pHdVideo': 720,
    '1080pHdVideo': 1080,
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const token = await this.getToken(webpage, videoId);

    const videos = await this._download_json<Record<string, unknown>>(
      'https://amp-api.music.apple.com/v1/catalog/us/uploaded-videos',
      videoId,
      undefined,
      {
        headers: { Authorization: `Bearer ${token}`, Origin: this._BASE_URL },
        query: { ids: videoId, l: 'en-US' },
      },
    );

    const attributes = traverse_obj(videos, ['data', 0, 'attributes']) as Record<string, unknown> | undefined;
    if (!attributes) throw new ExtractorError('Unable to extract video information', { expected: true });

    const formats: Format[] = [];
    const assetTokens = attributes.assetTokens as Record<string, string> | undefined;
    if (assetTokens) {
      for (const [formatId, srcUrl] of Object.entries(assetTokens)) {
        const u = url_or_none(srcUrl);
        if (!u) continue;
        formats.push({
          ext: 'm4v',
          format_id: formatId,
          height: AppleConnectIE._QUALITIES[formatId] ?? undefined,
          url: u,
        });
      }
    }

    return {
      id: videoId,
      formats,
      thumbnail:
        this._html_search_meta(['og:image', 'og:image:secure_url', 'twitter:image'], webpage) || undefined,
      title: str_or_none(attributes.name) || videoId,
      duration: float_or_none(attributes.durationInMilliseconds, 1000) ?? undefined,
      upload_date: unified_strdate(attributes.uploadDate) || undefined,
      uploader: str_or_none(attributes.artistName || attributes.uploadingArtistName) || undefined,
      webpage_url: url_or_none(attributes.postUrl) || url,
      original_url: url,
      extractor: 'apple:music:connect',
      extractor_key: 'AppleConnect',
    };
  }
}

export class ApplePodcastsIE extends AppleBaseIE {
  static IE_NAME = 'apple:podcasts';
  static IE_DESC = 'Apple Podcasts';
  static _VALID_URL =
    /https?:\/\/podcasts\.apple\.com\/(?<country>[^/?#]+\/)?podcast(?:\/[^/?#]+){1,2}\/?\?(?:[^#]+&)?i=(?<id>\d+)/;

  protected _BASE_URL = 'https://podcasts.apple.com';
  protected _JWT_KEY_ID = 'C4J7GBP74H';

  private async extractFromApi(
    webpage: string,
    episodeId: string,
    pageUrl: string,
    countryCode?: string | null,
  ): Promise<VideoInfo | null> {
    const token = await this.getToken(webpage, episodeId);
    const data = await this._download_json<{ data?: Record<string, unknown>[] }>(
      `https://amp-api.podcasts.apple.com/v1/catalog/${(countryCode || 'us').replace(/\//, '')}/podcast-episodes/${episodeId}`,
      episodeId,
      undefined,
      {
        headers: { Authorization: `Bearer ${token}`, Origin: this._BASE_URL },
        query: { extend: 'fullDescription', include: 'podcast', l: 'en-US' },
      },
    );
    const row = data.data?.[0];
    if (!row) return null;
    const attrs = row.attributes as Record<string, unknown>;
    const artwork = attrs.artwork as Record<string, unknown> | undefined;
    let thumbnail: string | undefined;
    if (artwork?.url) {
      thumbnail = String(artwork.url)
        .replace('{w}', String(artwork.width || '600'))
        .replace('{h}', String(artwork.height || '600'))
        .replace('{f}', 'jpg');
    }
    const assetUrl = attrs.assetUrl != null ? String(attrs.assetUrl).replace(/^http:/, 'https:') : '';
    return {
      id: episodeId,
      title: str_or_none(attrs.name) || episodeId,
      description: clean_html(attrs.fullDescription != null ? String(attrs.fullDescription) : null),
      url: assetUrl || undefined,
      formats: assetUrl ? [{ format_id: 'direct', url: assetUrl, vcodec: 'none', ext: 'm4a' }] : [],
      timestamp: parseIso8601(attrs.releaseDateTime),
      duration: int_or_none(attrs.durationInMilliseconds, 1000) ?? undefined,
      episode: str_or_none(attrs.name) || undefined,
      episode_number: int_or_none(attrs.episodeNumber) ?? undefined,
      series: str_or_none(
        traverse_obj(row, ['relationships', 'podcast', 'data', 0, 'attributes', 'name']),
      ) || undefined,
      thumbnail,
      vcodec: 'none',
      webpage_url: pageUrl,
      original_url: pageUrl,
      extractor: 'apple:podcasts',
      extractor_key: 'ApplePodcasts',
    };
  }

  private extractFromWebpage(webpage: string, episodeId: string): VideoInfo | null {
    const serverData = this._search_json<Record<string, unknown>>(
      /<script [^>]*\bid=["']serialized-server-data["'][^>]*>/,
      webpage,
      'server data',
      episodeId,
      { fatal: false },
    );
    const items = traverse_obj(serverData, ['data', 0, 'data', 'headerButtonItems']) as
      | Record<string, unknown>[]
      | undefined;
    const model = items?.find(
      (v) => v.$kind === 'share' && v.modelType === 'EpisodeLockup',
    )?.model as Record<string, unknown> | undefined;
    if (!model) return null;

    const streamUrl = traverse_obj(model, ['playAction', 'episodeOffer', 'streamUrl']);
    const audioUrl = streamUrl != null ? String(streamUrl) : '';
    return {
      id: episodeId,
      title: str_or_none(model.title) || episodeId,
      description: clean_html(model.summary != null ? String(model.summary) : null),
      url: audioUrl || undefined,
      formats: audioUrl ? [{ format_id: 'direct', url: audioUrl, vcodec: 'none', ext: 'm4a' }] : [],
      timestamp: parseIso8601(model.releaseDate),
      duration: int_or_none(model.duration) ?? undefined,
      episode: str_or_none(model.title) || undefined,
      episode_number: int_or_none(model.episodeNumber) ?? undefined,
      series: str_or_none(model.showTitle) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      vcodec: 'none',
      extractor: 'apple:podcasts',
      extractor_key: 'ApplePodcasts',
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const episodeId = m.groups?.id ?? m[2] ?? '';
    const countryCode = m.groups?.country ?? m[1];
    const webpage = await this._download_webpage(url, episodeId, undefined, { fatal: false });

    return (
      this.extractFromWebpage(webpage, episodeId) ||
      (await this.extractFromApi(webpage, episodeId, url, countryCode)) ||
      (() => {
        throw new ExtractorError('Unable to extract Apple Podcasts episode', { expected: true });
      })()
    );
  }
}
