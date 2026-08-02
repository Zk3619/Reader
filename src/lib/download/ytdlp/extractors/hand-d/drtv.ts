/**
 * DR.dk / DRTV — ported from yt-dlp drtv.py
 *
 * Pragmatic note: HDS/f4m formats in DRTVLiveIE are skipped (HLS only), mirroring hand-b/bbc.ts.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  int_or_none,
  js_to_json,
  mimetype2ext,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

const SERIES_API =
  'https://production-cdn.dr-massive.com/api/page?device=web_browser&item_detail_expand=all&lang=da&max_list_prefetch=3&path=%s';

const SUBTITLE_LANGS: Record<string, string> = {
  DanishLanguageSubtitles: 'da',
  ForeignLanguageSubtitles: 'da_foreign',
  CombinedLanguageSubtitles: 'da_combined',
};

function findPageItem(jsonData: Record<string, unknown>): Record<string, unknown> | undefined {
  const page = (jsonData.cache as Record<string, unknown> | undefined)?.page as
    | Record<string, unknown>
    | undefined;
  if (!page) return undefined;
  for (const val of Object.values(page)) {
    if (!val || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;
    if (rec.item && typeof rec.item === 'object') return rec.item as Record<string, unknown>;
    const first = (rec.entries as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
    if (first?.item && typeof first.item === 'object') return first.item as Record<string, unknown>;
  }
  return undefined;
}

export class DRTVIE extends InfoExtractor {
  static IE_NAME = 'drtv';
  static _GEO_BYPASS = false;
  static _GEO_COUNTRIES = ['DK'];
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:dr\.dk\/tv\/se(?:\/ondemand)?\/(?:[^/?#]+\/)*|(?:dr\.dk|dr-massive\.com)\/drtv\/(?:se|episode|program)\/)(?<id>[\da-z_-]+)/i;

  protected _token: string | null = null;

  protected async _ensureToken(): Promise<string> {
    if (this._token) return this._token;

    const tokenResponse = await this._download_json<Record<string, unknown>>(
      'https://isl.dr-massive.com/api/authorization/anonymous-sso',
      undefined,
      'Downloading anonymous token',
      {
        headers: { 'content-type': 'application/json' },
        query: {
          device: 'phone_android',
          lang: 'da',
          supportFallbackToken: 'true',
        },
        data: JSON.stringify({
          deviceId: crypto.randomUUID(),
          scopes: ['Catalog'],
          optout: true,
        }),
        method: 'POST',
      },
    );

    const entries = Object.values(tokenResponse).filter(
      (x): x is Record<string, unknown> => !!x && typeof x === 'object',
    );
    for (const entry of entries) {
      if (entry.type === 'UserAccount' && typeof entry.value === 'string') {
        this._token = entry.value;
        break;
      }
    }
    if (!this._token) {
      const token = traverse_obj(tokenResponse, [
        (obj: unknown) => {
          if (!obj || typeof obj !== 'object') return undefined;
          for (const v of Object.values(obj as Record<string, unknown>)) {
            if (v && typeof v === 'object' && (v as Record<string, unknown>).type === 'UserAccount') {
              return (v as Record<string, unknown>).value;
            }
          }
          return undefined;
        },
        { expected_type: (v) => str_or_none(v) },
      ]) as string | undefined;
      this._token = token || null;
    }
    if (!this._token) throw new ExtractorError('Unable to get anonymous token', { expected: true });
    return this._token;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._ensureToken();
    const urlSlug = this._match_id(url);
    const webpage = await this._download_webpage(url, urlSlug);

    const jsonData =
      this._search_json<Record<string, unknown>>(
        /window\.__data\s*=/,
        webpage,
        'data',
        urlSlug,
        { fatal: false, transform_source: js_to_json },
      ) || {};

    let item = findPageItem(jsonData);

    let itemId: string | undefined = str_or_none(item?.id) ?? undefined;
    if (!item) {
      itemId = urlSlug.split('_').pop() || urlSlug;
      item = await this._download_json<Record<string, unknown>>(
        `https://production-cdn.dr-massive.com/api/items/${itemId}`,
        itemId,
        'Attempting to download backup item data',
        {
          query: {
            device: 'web_browser',
            expand: 'all',
            ff: 'idp,ldp,rpt',
            geoLocation: 'dk',
            isDeviceAbroad: 'false',
            lang: 'da',
            segments: 'drtv,optedout',
            sub: 'Anonymous',
          },
        },
      );
    }

    const customId = str_or_none(item?.customId);
    const videoId = customId?.split(':').pop() || itemId || urlSlug;

    const streamData = await this._download_json<Record<string, unknown>[]>(
      `https://production.dr-massive.com/api/account/items/${itemId}/videos`,
      videoId,
      'Downloading stream data',
      {
        query: {
          delivery: 'stream',
          device: 'web_browser',
          ff: 'idp,ldp,rpt',
          lang: 'da',
          resolution: 'HD-1080',
          sub: 'Anonymous',
        },
        headers: { authorization: `Bearer ${this._token}` },
      },
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const streams = Array.isArray(streamData) ? streamData : [];

    for (const stream of streams) {
      const streamUrl = url_or_none(stream?.url);
      if (!streamUrl) continue;

      let formatId = str_or_none(stream.format) || 'na';
      const accessService = str_or_none(stream.accessService);
      let preference: number | undefined;
      let subtitleSuffix = '';
      if (accessService && ['SpokenSubtitles', 'SignLanguage', 'VisuallyInterpreted'].includes(accessService)) {
        preference = -1;
        formatId += `-${accessService}`;
        subtitleSuffix = `-${accessService}`;
      } else if (accessService === 'StandardVideo') {
        preference = 1;
      }

      const { formats: hlsFormats, subtitles: hlsSubs } = await extractM3u8FormatsAndSubtitles(
        this,
        streamUrl,
        videoId,
        formatId,
      );
      if (preference != null) {
        for (const f of hlsFormats) f.preference = preference;
      }
      formats.push(...hlsFormats);

      const apiSubtitles = (stream.subtitles as Record<string, unknown>[] | undefined)?.filter((sub) =>
        url_or_none((sub as Record<string, unknown>).link),
      );
      if (!apiSubtitles?.length) {
        mergeSubtitles(subtitles, hlsSubs);
      } else {
        for (const subTrack of apiSubtitles) {
          const lang = str_or_none(subTrack.language) || 'da';
          const key = (SUBTITLE_LANGS[lang] || lang) + subtitleSuffix;
          (subtitles[key] ||= []).push({
            url: String(subTrack.link),
            ext: mimetype2ext(str_or_none(subTrack.format)) || 'vtt',
          });
        }
      }
    }

    if (!formats.length && traverse_obj(item, ['season', 'customFields', 'IsGeoRestricted'])) {
      this.raise_geo_restricted(undefined, DRTVIE._GEO_COUNTRIES);
    }

    const season = item.season as Record<string, unknown> | undefined;
    const show = season?.show as Record<string, unknown> | undefined;
    const customFields = item.customFields as Record<string, unknown> | undefined;
    const images = item.images as Record<string, unknown> | undefined;

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(item.title) ?? undefined,
      alt_title: str_or_none(item.contextualTitle) ?? undefined,
      description: str_or_none(item.description) ?? undefined,
      thumbnail: url_or_none(images?.wallpaper) ?? undefined,
      release_timestamp: parseIso8601(customFields?.BroadcastTimeDK) ?? undefined,
      duration: int_or_none(item.duration) ?? undefined,
      series: str_or_none(show?.title) ?? undefined,
      season: str_or_none(season?.title) ?? undefined,
      season_number: int_or_none(season?.seasonNumber) ?? undefined,
      season_id: str_or_none(item.seasonId) ?? undefined,
      episode: str_or_none(item.episodeName) ?? undefined,
      episode_number: int_or_none(item.episodeNumber) ?? undefined,
      release_year: int_or_none(item.releaseYear) ?? undefined,
    };
  }
}

export class DRTVLiveIE extends InfoExtractor {
  static IE_NAME = 'drtv:live';
  static _GEO_COUNTRIES = ['DK'];
  static _VALID_URL = /https?:\/\/(?:www\.)?dr\.dk\/(?:tv|TV)\/live\/(?<id>[\da-z-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const channelData = await this._download_json<Record<string, unknown>>(
      `https://www.dr.dk/mu-online/api/1.0/channel/${channelId}`,
      channelId,
    );
    const title = str_or_none(channelData.Title) || channelId;

    const formats: Format[] = [];
    for (const streamingServer of (channelData.StreamingServers as Record<string, unknown>[]) || []) {
      const server = str_or_none(streamingServer.Server);
      if (!server) continue;
      const linkType = str_or_none(streamingServer.LinkType);
      for (const quality of (streamingServer.Qualities as Record<string, unknown>[]) || []) {
        for (const stream of (quality.Streams as Record<string, unknown>[]) || []) {
          const streamPath = str_or_none(stream.Stream);
          if (!streamPath) continue;
          const streamUrl = update_url_query(`${server}/${streamPath}`, { b: '' });
          if (linkType === 'HLS') {
            formats.push(
              ...(await this._extract_m3u8_formats(
                streamUrl,
                channelId,
                'mp4',
                'm3u8_native',
                undefined,
                undefined,
                linkType,
                undefined,
                false,
              )),
            );
          }
        }
      }
    }

    return {
      id: channelId,
      title,
      thumbnail: str_or_none(channelData.PrimaryImageUri) ?? undefined,
      formats,
      is_live: true,
    };
  }
}

export class DRTVSeasonIE extends InfoExtractor {
  static IE_NAME = 'drtv:season';
  static _GEO_COUNTRIES = ['DK'];
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:dr\.dk|dr-massive\.com)\/drtv\/saeson\/(?<display_id>[\w-]+)_(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const seasonId = m.groups!.id!;
    const data = await this._download_json<Record<string, unknown>>(
      SERIES_API.replace('%s', `/saeson/${displayId}_${seasonId}`),
      displayId,
    );

    const rootItem = traverse_obj(data, ['entries', 0, 'item']) as Record<string, unknown> | undefined;
    const episodes = traverse_obj(rootItem, ['episodes', 'items']) as Record<string, unknown>[] | undefined;

    const entries: VideoInfo[] = (episodes || []).map((episode) => ({
      _type: 'url' as const,
      id: str_or_none(episode.id) || str_or_none(episode.customId) || displayId,
      url: `https://www.dr.dk/drtv${episode.path}`,
      ie_key: 'DRTV',
      title: str_or_none(episode.title) ?? undefined,
      alt_title: str_or_none(episode.contextualTitle) ?? undefined,
      episode: str_or_none(episode.episodeName) ?? undefined,
      description: str_or_none(episode.shortDescription) ?? undefined,
      series: str_or_none(rootItem?.title) ?? undefined,
      season_number: int_or_none(rootItem?.seasonNumber) ?? undefined,
      episode_number: int_or_none(episode.episodeNumber) ?? undefined,
    }));

    return {
      _type: 'playlist',
      id: seasonId,
      display_id: displayId,
      title: str_or_none(rootItem?.title) ?? undefined,
      alt_title: str_or_none(rootItem?.contextualTitle) ?? undefined,
      series: str_or_none(rootItem?.title) ?? undefined,
      entries,
      playlist_count: entries.length,
      season_number: int_or_none(rootItem?.seasonNumber) ?? undefined,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
    };
  }
}

export class DRTVSeriesIE extends InfoExtractor {
  static IE_NAME = 'drtv:series';
  static _GEO_COUNTRIES = ['DK'];
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:dr\.dk|dr-massive\.com)\/drtv\/serie\/(?<display_id>[\w-]+)_(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.display_id!;
    const seriesId = m.groups!.id!;
    const data = await this._download_json<Record<string, unknown>>(
      SERIES_API.replace('%s', `/serie/${displayId}_${seriesId}`),
      displayId,
    );

    const rootItem = traverse_obj(data, ['entries', 0, 'item']) as Record<string, unknown> | undefined;
    const seasons = traverse_obj(rootItem, ['show', 'seasons', 'items']) as Record<string, unknown>[] | undefined;

    const entries: VideoInfo[] = (seasons || []).map((season) => ({
      _type: 'url' as const,
      id: str_or_none(season.id) || seriesId,
      url: `https://www.dr.dk/drtv${season.path}`,
      ie_key: 'DRTVSeason',
      title: str_or_none(season.title) ?? undefined,
      alt_title: str_or_none(season.contextualTitle) ?? undefined,
      series: str_or_none(rootItem?.title) ?? undefined,
      season_number: int_or_none(rootItem?.seasonNumber) ?? undefined,
    }));

    return {
      _type: 'playlist',
      id: seriesId,
      display_id: displayId,
      title: str_or_none(rootItem?.title) ?? undefined,
      alt_title: str_or_none(rootItem?.contextualTitle) ?? undefined,
      series: str_or_none(rootItem?.title) ?? undefined,
      entries,
      playlist_count: entries.length,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
    };
  }
}
