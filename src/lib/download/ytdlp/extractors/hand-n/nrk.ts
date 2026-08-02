/** NRK* — ported from yt-dlp nrk.py (main NRKIE path; series/playlist simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  parse_duration,
  str_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

export class NRKBaseIE extends InfoExtractor {
  static IE_NAME = 'NRKBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _GEO_COUNTRIES = ['NO'];

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NRKBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractNrkFormats(assetUrl: string, videoId: string): Promise<Format[]> {
    const url = update_url_query(assetUrl, { adap: [], s: '0' });
    return this._extract_m3u8_formats(url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
  }

  protected _raiseError(data: Record<string, unknown>): never {
    const messageType = String(data.messageType ?? '');
    if (messageType.includes('IsGeoBlocked')) {
      this.raise_geo_restricted(undefined, NRKBaseIE._GEO_COUNTRIES);
    }
    const message = str_or_none(data.endUserMessage) || messageType;
    throw new ExtractorError(`${this.constructor.name} said: ${message}`, { expected: true });
  }

  protected async _callApi(path: string, videoId: string, note?: string, query?: Record<string, string>) {
    return this._download_json<Record<string, unknown>>(urljoin('https://psapi.nrk.no/', path), videoId, note, {
      query,
      headers: {
        Accept: 'application/vnd.nrk.psapi+json; version=9; player=tv-player; device=player-core',
      },
    });
  }
}

export class NRKIE extends NRKBaseIE {
  static IE_NAME = 'NRK';
  static _VALID_URL =
    /(?:nrk:|https?:\/\/(?:(?:www\.)?nrk\.no\/video\/(?:PS\*|[^_]+_)|v8[-.]psapi\.nrk\.no\/mediaelement\/))(?<id>[^?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url).split('/').pop() || this._match_id(url);

    const callPlayback = async (item: string) => {
      try {
        return await this._callApi(`playback/${item}/program/${videoId}`, videoId, undefined, { preferredCdn: 'akamai' });
      } catch (e) {
        const status = (e as { cause?: { status?: number } }).cause?.status;
        if (status === 400) return this._callApi(`playback/${item}/${videoId}`, videoId, undefined, { preferredCdn: 'akamai' });
        throw e;
      }
    };

    const manifest = await callPlayback('manifest');
    videoId = str_or_none(manifest.id) || videoId;
    if (manifest.playability === 'nonPlayable') {
      this._raiseError((manifest.nonPlayable as Record<string, unknown>) || {});
    }

    const playable = (manifest.playable as Record<string, unknown>) || {};
    const formats: Format[] = [];
    for (const asset of (playable.assets as Array<Record<string, unknown>>) || []) {
      if (!asset || asset.encrypted) continue;
      const formatUrl = url_or_none(asset.url);
      if (!formatUrl) continue;
      const assetFormat = String(asset.format || '').toLowerCase();
      if (assetFormat === 'hls' || determine_ext(formatUrl) === 'm3u8') {
        formats.push(...(await this._extractNrkFormats(formatUrl, videoId)));
      } else if (assetFormat === 'mp3') {
        formats.push({ url: formatUrl, format_id: 'mp3', vcodec: 'none', ext: 'mp3' });
      } else {
        formats.push({ url: formatUrl, format_id: assetFormat || 'http' });
      }
    }

    const data = await this._callApi('metadata', videoId);
    const preplay = (data.preplay as Record<string, unknown>) || {};
    const titles = (preplay.titles as Record<string, unknown>) || {};
    const description = str_or_none((preplay.description as string)?.replace(/\r/g, '\n')) ?? undefined;

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (playable.subtitles as Array<Record<string, unknown>>) || []) {
      const subUrl = url_or_none(sub.webVtt);
      if (!subUrl) continue;
      const subKey = `${str_or_none(sub.language) || 'nb'}${sub.type ? `-${sub.type}` : ''}`;
      (subtitles[subKey] ||= []).push({ url: subUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      title: str_or_none(titles.title) ?? videoId,
      alt_title: str_or_none(titles.subtitle) ?? undefined,
      description,
      duration: parse_duration(String(playable.duration ?? data.duration ?? '')) ?? undefined,
      formats,
      subtitles,
      timestamp: parseIso8601(traverse_obj(manifest, ['availability', 'onDemand', 'from']) as string) ?? undefined,
    };
  }
}

export class NRKTVIE extends InfoExtractor {
  static IE_NAME = 'NRKTV';
  static IE_DESC = 'NRK TV and NRK Radio';
  static _EPISODE_RE = /(?<id>[a-zA-Z]{4}\d{8})/;
  static _VALID_URL = /https?:\/\/(?:tv|radio)\.nrk(?:super)?\.no\/(?:[^/]+\/)*[a-zA-Z]{4}\d{8}/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(NRKTVIE._EPISODE_RE);
    const videoId = m?.groups?.id ?? this._match_id(url);
    return this.url_result(`nrk:${videoId}`, 'NRK', videoId);
  }
}

export class NRKTVEpisodeIE extends InfoExtractor {
  static IE_NAME = 'NRKTVEpisode';
  static _VALID_URL =
    /https?:\/\/tv\.nrk\.no\/serie\/(?<id>[^/?#]+\/sesong\/(?<season_number>\d+)\/episode\/(?<episode_number>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const displayId = m?.groups?.id ?? '';
    const webpage = await this._download_webpage(url, displayId);
    const pageDataMatch = webpage.match(/id="pageData"[^>]*>([\s\S]*?)<\/script>/);
    let nrkId = '';
    if (pageDataMatch) {
      const pd = this._parse_json<{ initialState?: { selectedEpisodePrfId?: string } }>(pageDataMatch[1]!, displayId)!;
      nrkId = pd.initialState?.selectedEpisodePrfId || '';
    }
    if (!nrkId) {
      const redirect = webpage.match(NRKTVIE._EPISODE_RE);
      nrkId = redirect?.groups?.id || '';
    }
    return {
      ...this.url_result(`nrk:${nrkId}`, 'NRK', nrkId),
      season_number: int_or_none(m?.groups?.season_number) ?? undefined,
      episode_number: int_or_none(m?.groups?.episode_number) ?? undefined,
    };
  }
}

export class NRKTVSerieBaseIE extends NRKBaseIE {
  static IE_NAME = 'NRKTVSerieBase';
  static _ASSETS_KEYS = ['episodes', 'instalments'];

  protected _extractEntries(entryList: unknown): VideoInfo[] {
    if (!Array.isArray(entryList)) return [];
    return entryList
      .map((episode) => {
        const ep = episode as Record<string, unknown>;
        const nrkId = str_or_none(ep.prfId) || str_or_none(ep.episodeId);
        return nrkId ? this.url_result(`nrk:${nrkId}`, 'NRK', nrkId) : null;
      })
      .filter(Boolean) as VideoInfo[];
  }

  protected async *_entries(data: Record<string, unknown>, displayId: string): AsyncGenerator<VideoInfo> {
    for (let page = 1; ; page++) {
      const embedded = (data._embedded as Record<string, unknown>) || data;
      const assetsKey = NRKTVSerieBaseIE._ASSETS_KEYS.find((k) => embedded[k]);
      if (!assetsKey) break;
      const assets = embedded[assetsKey] as Record<string, unknown>;
      const entries =
        (traverse_obj(assets, ['_embedded', assetsKey]) as unknown[]) ||
        (assets as unknown as unknown[]);
      for (const e of this._extractEntries(Array.isArray(entries) ? entries : [])) yield e;
      const nextHref = traverse_obj(data, ['_links', 'next', 'href']) || traverse_obj(assets, ['_links', 'next', 'href']);
      if (!nextHref) break;
      data = (await this._callApi(String(nextHref), displayId, `page ${page}`, undefined)) || {};
      if (!data || !Object.keys(data).length) break;
    }
  }
}

export class NRKTVSeasonIE extends NRKTVSerieBaseIE {
  static IE_NAME = 'NRKTVSeason';
  static _VALID_URL =
    /https?:\/\/(?<domain>tv|radio)\.nrk\.no\/(?<serie_kind>serie|pod[ck]ast)\/(?<serie>[^/]+)\/(?:sesong\/)?(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    if (NRKTVIE.suitable(url) || NRKTVEpisodeIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const domain = m?.groups?.domain ?? 'tv';
    const serieKind = m?.groups?.serie_kind ?? 'serie';
    const serie = m?.groups?.serie ?? '';
    const seasonId = m?.groups?.id ?? '';
    const displayId = `${serie}/${seasonId}`;
    const catalog = serieKind.includes('pod') ? 'podcast' : 'series';
    const data = await this._callApi(`${domain}/catalog/${catalog}/${serie}/seasons/${seasonId}`, displayId, 'season', {
      pageSize: '50',
    });
    const title = str_or_none(traverse_obj(data, ['titles', 'title'])) || displayId;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(data, displayId)) entries.push(e);
    return this.playlist_result(entries, displayId, title);
  }
}

export class NRKTVSeriesIE extends NRKTVSerieBaseIE {
  static IE_NAME = 'NRKTVSeries';
  static _VALID_URL =
    /https?:\/\/(?<domain>(?:tv|radio)\.nrk|(?:tv\.)?nrksuper)\.no\/(?<serie_kind>serie|pod[ck]ast)\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const domain = m?.groups?.domain ?? 'tv.nrk';
    const serieKind = m?.groups?.serie_kind ?? 'serie';
    const serieId = m?.groups?.id ?? this._match_id(url);
    const catalog = serieKind.includes('pod') ? 'podcast' : 'series';
    const host = domain.includes('.') ? domain.split('.')[0] : 'tv';
    const data = await this._callApi(`${host}/catalog/${catalog}/${serieId}`, serieId, 'series', { pageSize: '50' });
    const title = str_or_none(traverse_obj(data, ['titles', 'title'])) || serieId;
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(data, serieId)) entries.push(e);
    return this.playlist_result(entries, serieId, title);
  }
}

export class NRKTVDirekteIE extends NRKTVIE {
  static IE_NAME = 'NRKTVDirekte';
  static _VALID_URL = /https?:\/\/(?:tv|radio)\.nrk\.no\/direkte\/(?<id>[^/?#]+)/;
}

export class NRKRadioPodkastIE extends InfoExtractor {
  static IE_NAME = 'NRKRadioPodkast';
  static _VALID_URL = /https?:\/\/radio\.nrk\.no\/podkast\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    return this.url_result(`nrk:podcast/${podcastId}`, 'NRK', podcastId);
  }
}

export class NRKPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'NRKPlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NRKPlaylistBaseIE is not a standalone extractor', { expected: true });
  }
}

export class NRKPlaylistIE extends NRKPlaylistBaseIE {
  static IE_NAME = 'NRKPlaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?nrk\.no\/radio\/programmer\/utland\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const ids = [...webpage.matchAll(/\/mediaelement\/([a-zA-Z0-9_-]+)/g)].map((m) => m[1]!);
    const entries = ids.map((id) => this.url_result(`nrk:${id}`, 'NRK', id));
    return this.playlist_result(entries, playlistId);
  }
}

export class NRKTVEpisodesIE extends NRKPlaylistBaseIE {
  static IE_NAME = 'NRKTVEpisodes';
  static _VALID_URL = /https?:\/\/(?:www\.)?nrk\.no\/programmer\/(?:programmer|program)\/(?:programmer|program)\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const ids = [...webpage.matchAll(/\/video\/([A-Z]{4}\d{8})/g)].map((m) => m[1]!);
    const entries = ids.map((id) => this.url_result(`nrk:${id}`, 'NRK', id));
    return this.playlist_result(entries, playlistId);
  }
}

export class NRKSkoleIE extends InfoExtractor {
  static IE_NAME = 'NRKSkole';
  static _VALID_URL = /https?:\/\/(?:www\.)?nrk\.no\/skole\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const topicId = this._match_id(url);
    const webpage = await this._download_webpage(url, topicId);
    const ids = [...webpage.matchAll(/\/video\/([A-Z]{4}\d{8})/g)].map((m) => m[1]!);
    const entries = ids.map((id) => this.url_result(`nrk:${id}`, 'NRK', id));
    return this.playlist_result(entries, topicId);
  }
}
