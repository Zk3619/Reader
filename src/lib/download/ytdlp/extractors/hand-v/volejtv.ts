// @ts-nocheck
/**
 * VolejTV* â€?ported from yt-dlp volejtv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { orderedSet } from './_helpers';

const TBR_HEIGHT_MAPPING: Record<string, number> = {
  '6000': 1080,
  '2400': 720,
  '1500': 480,
  '800': 360,
};

function strftimeOrNone(ts: number | null | undefined, fmt: string): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const d = new Date(ts * 1000);
  if (fmt === '(%Y-%m-%d)') {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `(${y}-${m}-${day})`;
  }
  return null;
}

export class VolejTVBaseIE extends InfoExtractor {
  static IE_NAME = 'volejtvbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('VolejTVBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    endpoint: string,
    displayId: string,
    query?: Record<string, string | number>,
  ): Promise<any> {
    return this._download_json(
      `https://api-volejtv-prod.apps.okd4.devopsie.cloud/api/${endpoint}`,
      displayId,
      undefined,
      {
        query: query
          ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))
          : undefined,
      },
    );
  }
}

export class VolejTVIE extends VolejTVBaseIE {
  static IE_NAME = 'volejtv:match';
  static _VALID_URL = /https?:\/\/volej\.tv\/match\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const jsonData = await this._callApi(`match/${videoId}`, videoId);

    const formats: Format[] = [];
    const qualities =
      (traverse_obj(jsonData, ['videos', 0, 'qualities']) as Array<Record<string, unknown>>) || [];
    for (const video of qualities) {
      const path = url_or_none(video.cloud_front_path);
      if (!path) continue;
      const tbr = int_or_none(video.quality);
      formats.push({
        url: path,
        tbr: tbr ?? undefined,
        format_id: str_or_none(video.id) || undefined,
        height: tbr != null ? TBR_HEIGHT_MAPPING[String(tbr)] : undefined,
      });
    }

    const teams = orderedSet(
      ((jsonData.teams as Array<Record<string, unknown>>) || [])
        .map((t) => str_or_none(t.shortcut))
        .filter(Boolean) as string[],
    );
    if (teams.length > 2 && teams.includes('FIN')) {
      const i = teams.indexOf('FIN');
      if (i >= 0) teams.splice(i, 1);
    }

    const timestamp = unified_timestamp(jsonData.match_time);
    const category = traverse_obj(jsonData, ['category', 'title']);
    const titleParts = [teams.join('-'), strftimeOrNone(timestamp, '(%Y-%m-%d)')].filter(Boolean);

    return {
      id: videoId,
      series: str_or_none(jsonData.competition_name) || undefined,
      season: str_or_none(jsonData.season) || undefined,
      timestamp: timestamp ?? undefined,
      categories: typeof category === 'string' && category ? [category] : undefined,
      thumbnail: url_or_none(jsonData.poster) ?? undefined,
      formats,
      title: titleParts.join(' ') || videoId,
    };
  }
}

export class VolejTVPlaylistBaseIE extends VolejTVBaseIE {
  static IE_NAME = 'volejtvplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected static _API_FILTER = '';
  protected static _PAGE_SIZE = 10;

  protected async _getPage(playlistId: string, page: number): Promise<Record<string, unknown>> {
    const Ctor = this.constructor as typeof VolejTVPlaylistBaseIE;
    return this._callApi(`match/${Ctor._API_FILTER}/${playlistId}`, playlistId, {
      page: page + 1,
      take: Ctor._PAGE_SIZE,
      order: 'DESC',
    });
  }

  protected _entriesFromPage(pageData: Record<string, unknown>): VideoInfo[] {
    const rows = (pageData.data as Array<Record<string, unknown>>) || [];
    return rows
      .map((row) => row.id)
      .filter((id) => id != null)
      .map((matchId) => this.url_result(`https://volej.tv/match/${matchId}`, VolejTVIE.IE_NAME, String(matchId)));
  }
}

export class VolejTVClubPlaylistIE extends VolejTVPlaylistBaseIE {
  static IE_NAME = 'volejtv:club';
  static _VALID_URL = /https?:\/\/volej\.tv\/klub\/(?<id>\d+)/;
  protected static _API_FILTER = 'by-team-id-paginated';
  protected static _PAGE_SIZE = 6;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const team = await this._callApi(`team/show/${playlistId}`, playlistId);
    const title = str_or_none(team.title) || playlistId;
    const firstPage = await this._getPage(playlistId, 0);
    const totalPages = int_or_none(traverse_obj(firstPage, ['meta', 'pageCount']));
    if (totalPages == null) {
      throw new ExtractorError('Unable to extract page count', { expected: true });
    }
    const entries: VideoInfo[] = [...this._entriesFromPage(firstPage)];
    for (let page = 1; page < totalPages; page++) {
      entries.push(...this._entriesFromPage(await this._getPage(playlistId, page)));
    }
    return this.playlist_result(entries, playlistId, title);
  }
}

export class VolejTVCategoryPlaylistIE extends VolejTVPlaylistBaseIE {
  static IE_NAME = 'volejtv:category';
  static _VALID_URL = /https?:\/\/volej\.tv\/kategorie\/(?<id>[^/$?]+)/;
  protected static _API_FILTER = 'by-category-id-paginated';
  protected static _PAGE_SIZE = 10;

  protected async _getCategory(playlistId: string): Promise<[string, string]> {
    const categories = await this._callApi('category', playlistId);
    const list = Array.isArray(categories) ? categories : [];
    for (const category of list as Array<Record<string, unknown>>) {
      if (category.slug && category.id && category.title && category.slug === playlistId) {
        return [String(category.id), String(category.title)];
      }
    }
    throw new ExtractorError(`Unable to find category ${playlistId}`, { expected: true });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const [categoryId, title] = await this._getCategory(playlistId);
    const firstPage = await this._getPage(categoryId, 0);
    const totalPages = int_or_none(traverse_obj(firstPage, ['meta', 'pageCount']));
    if (totalPages == null) {
      throw new ExtractorError('Unable to extract page count', { expected: true });
    }
    const entries: VideoInfo[] = [...this._entriesFromPage(firstPage)];
    for (let page = 1; page < totalPages; page++) {
      entries.push(...this._entriesFromPage(await this._getPage(categoryId, page)));
    }
    return this.playlist_result(entries, playlistId, title);
  }
}
