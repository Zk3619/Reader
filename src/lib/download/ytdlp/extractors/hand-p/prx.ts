/** PRX* IEs — ported from yt-dlp prx.py (search IEs simplified) */

import { ExtractorError, InfoExtractor, SearchInfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  mimetype2ext,
  str_or_none,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

const PRX_BASE = 'https://cms.prx.org/api/v1/';

function prxEmbed(response: Record<string, unknown>, section: string): unknown {
  const embedded = response._embedded as Record<string, unknown> | undefined;
  return embedded?.[`prx:${section}`];
}

function prxFileLink(response: Record<string, unknown>): string | null {
  const links = response._links as Record<string, Record<string, unknown>> | undefined;
  return url_or_none(links?.enclosure?.href);
}

export class PRXBaseIE extends InfoExtractor {
  static IE_NAME = 'prxbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PRXBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    itemId: string,
    path: string,
    query?: Record<string, string | number>,
    note = 'Downloading CMS API JSON',
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(urljoin(PRX_BASE, path), itemId, note, {
        query: query
          ? (Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) as Record<string, string>)
          : undefined,
      })) || {}
    );
  }

  protected static _extractBaseInfo(response: Record<string, unknown>): Partial<VideoInfo> | undefined {
    const itemId = str_or_none(response.id);
    if (!itemId) return undefined;
    const image = prxEmbed(response, 'image') as Record<string, unknown> | undefined;
    return {
      id: itemId,
      title: (response.title as string) || itemId,
      description: clean_html(str_or_none(response.description)) || (response.shortDescription as string) || undefined,
      release_timestamp: unified_timestamp(response.releasedAt) ?? undefined,
      timestamp: unified_timestamp(response.createdAt) ?? undefined,
      modified_timestamp: unified_timestamp(response.updatedAt) ?? undefined,
      duration: int_or_none(response.duration) ?? undefined,
      tags: response.tags as string[] | undefined,
      episode_number: int_or_none(response.episodeIdentifier) ?? undefined,
      season_number: int_or_none(response.seasonIdentifier) ?? undefined,
      thumbnails: image
        ? (() => {
            const thumbUrl = prxFileLink(image);
            return thumbUrl ? [{ id: str_or_none(image.id) ?? undefined, url: thumbUrl }] : undefined;
          })()
        : undefined,
    };
  }

  protected static _extractStoryInfo(response: Record<string, unknown>): Partial<VideoInfo> | undefined {
    const base = PRXBaseIE._extractBaseInfo(response);
    if (!base) return undefined;
    const series = prxEmbed(response, 'series') as Record<string, unknown> | undefined;
    const account = prxEmbed(response, 'account') as Record<string, unknown> | undefined;
    const seriesInfo = series ? PRXBaseIE._extractBaseInfo(series) : undefined;
    const accountInfo = account ? PRXBaseIE._extractBaseInfo(account) : undefined;
    return {
      ...base,
      series: seriesInfo?.title,
      series_id: seriesInfo?.id,
      channel_id: accountInfo?.id,
      channel_url: accountInfo?.id ? `https://beta.prx.org/accounts/${accountInfo.id}` : undefined,
      channel: (account?.name as string) || undefined,
    };
  }

  static async entriesPaged(
    ie: PRXBaseIE,
    itemId: string,
    endpoint: string,
    entryFn: (item: Record<string, unknown>) => VideoInfo | undefined,
    query?: Record<string, string | number>,
  ): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    let total = 0;
    for (let page = 1; ; page++) {
      const q: Record<string, string> = { ...(query ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) : {}), page: String(page), per: '100' };
      const response = await ie._callApi(`${itemId}: page ${page}`, endpoint, q);
      const items = prxEmbed(response, 'items') as Array<Record<string, unknown>> | undefined;
      if (!response || !items?.length) break;
      for (const item of items) {
        const entry = entryFn(item);
        if (entry) entries.push(entry);
      }
      total += Number(response.count ?? 0);
      if (total >= Number(response.total ?? 0)) break;
    }
    return entries;
  }

  protected async *_entriesPaged(
    itemId: string,
    endpoint: string,
    entryFn: (item: Record<string, unknown>) => VideoInfo | undefined,
    query?: Record<string, string | number>,
  ): AsyncGenerator<VideoInfo> {
    let total = 0;
    for (let page = 1; ; page++) {
      const response = await this._callApi(`${itemId}: page ${page}`, endpoint, {
        ...(query ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) : {}),
        page: String(page),
        per: '100',
      });
      const items = prxEmbed(response, 'items') as Array<Record<string, unknown>> | undefined;
      if (!response || !items?.length) break;
      for (const item of items) {
        const entry = entryFn(item);
        if (entry) yield entry;
      }
      total += Number(response.count ?? 0);
      if (total >= Number(response.total ?? 0)) break;
    }
  }

  _storyPlaylistEntry(response: Record<string, unknown>): VideoInfo | undefined {
    const story = PRXBaseIE._extractStoryInfo(response);
    if (!story?.id) return undefined;
    return { ...story, id: story.id, _type: 'url', url: `https://beta.prx.org/stories/${story.id}`, ie_key: 'PRXStory' };
  }

  _seriesPlaylistEntry(response: Record<string, unknown>): VideoInfo | undefined {
    const base = PRXBaseIE._extractBaseInfo(response);
    if (!base?.id) return undefined;
    const account = prxEmbed(response, 'account') as Record<string, unknown> | undefined;
    return {
      ...base,
      id: base.id,
      channel_id: str_or_none(account?.id) ?? undefined,
      channel: account?.name as string | undefined,
      series: base.title ?? undefined,
      series_id: base.id,
      _type: 'url',
      url: `https://beta.prx.org/series/${base.id}`,
      ie_key: 'PRXSeries',
    };
  }
}

export class PRXStoryIE extends PRXBaseIE {
  static IE_NAME = 'prxstory';
  static _VALID_URL = /https?:\/\/(?:(?:beta|listen)\.)?prx\.org\/stories\/(?<id>\d+)/;

  protected _extractAudioPieces(audioResponse: Record<string, unknown>): Format[] {
    const items = (prxEmbed(audioResponse, 'items') as Array<Record<string, unknown>>) || [];
    return [...items]
      .sort((a, b) => (int_or_none(a.position) ?? 0) - (int_or_none(b.position) ?? 0))
      .map((piece) => ({
        format_id: str_or_none(piece.id) || 'audio',
        format_note: str_or_none(piece.label) ?? undefined,
        filesize: int_or_none(piece.size) ?? undefined,
        duration: int_or_none(piece.duration) ?? undefined,
        ext: mimetype2ext(str_or_none(piece.contentType)) || 'mp3',
        abr: int_or_none(piece.bitRate) ?? undefined,
        url: prxFileLink(piece) || '',
        vcodec: 'none',
      }))
      .filter((f) => f.url);
  }

  protected _extractStory(storyResponse: Record<string, unknown>): VideoInfo | undefined {
    const info = PRXBaseIE._extractStoryInfo(storyResponse);
    if (!info) return undefined;
    const audioPieces = this._extractAudioPieces((prxEmbed(storyResponse, 'audio') as Record<string, unknown>) || {});
    if (audioPieces.length === 1) return { ...info, id: info.id!, formats: audioPieces };
    if (!audioPieces.length) return { ...info, id: info.id! };
    return {
      _type: 'multi_video',
      id: info.id!,
      entries: audioPieces.map((fmt, idx) => ({
        ...info,
        id: `${info.id}_part${idx + 1}`,
        formats: [fmt],
      })),
      ...info,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const storyId = this._match_id(url);
    const response = await this._callApi(storyId, `stories/${storyId}`);
    const result = this._extractStory(response);
    if (!result) throw new ExtractorError('Unable to extract story', { expected: true });
    return result;
  }
}

export class PRXSeriesIE extends PRXBaseIE {
  static IE_NAME = 'prxseries';
  static _VALID_URL = /https?:\/\/(?:(?:beta|listen)\.)?prx\.org\/series\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const response = await this._callApi(seriesId, `series/${seriesId}`);
    const info = PRXBaseIE._extractBaseInfo(response);
    if (!info?.id) throw new ExtractorError('Unable to extract series', { expected: true });
    const entries: VideoInfo[] = [];
    for await (const e of this._entriesPaged(info.id, `series/${info.id}/stories`, (r) => this._storyPlaylistEntry(r))) {
      entries.push(e);
    }
    return this.playlist_result(entries, info.id, info.title);
  }
}

export class PRXAccountIE extends PRXBaseIE {
  static IE_NAME = 'prxaccount';
  static _VALID_URL = /https?:\/\/(?:(?:beta|listen)\.)?prx\.org\/accounts\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const accountId = this._match_id(url);
    const response = await this._callApi(accountId, `accounts/${accountId}`);
    const base = PRXBaseIE._extractBaseInfo(response);
    if (!base?.id) throw new ExtractorError('Unable to extract account', { expected: true });
    const info = {
      ...base,
      title: (response.name as string) || base.title,
      channel_id: base.id,
      channel_url: `https://beta.prx.org/accounts/${base.id}`,
      channel: response.name as string | undefined,
    };
    const entries: VideoInfo[] = [];
    for await (const e of this._entriesPaged(info.id!, `accounts/${info.id}/series`, (r) => this._seriesPlaylistEntry(r))) {
      entries.push(e);
    }
    for await (const e of this._entriesPaged(info.id!, `accounts/${info.id}/stories`, (r) => this._storyPlaylistEntry(r))) {
      entries.push(e);
    }
    return this.playlist_result(entries, info.id, info.title, info.description);
  }
}

export class PRXStoriesSearchIE extends SearchInfoExtractor {
  static IE_NAME = 'prxstories:search';
  static IE_DESC = 'PRX Stories Search';
  static _SEARCH_KEY = 'prxstories';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const base = new PRXBaseIE();
    const entries = await PRXBaseIE.entriesPaged(base, `query ${query}`, 'stories/search', (r) => base._storyPlaylistEntry(r), { q: query });
    return entries.slice(0, n);
  }
}

export class PRXSeriesSearchIE extends SearchInfoExtractor {
  static IE_NAME = 'prxseries:search';
  static IE_DESC = 'PRX Series Search';
  static _SEARCH_KEY = 'prxseries';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const base = new PRXBaseIE();
    const entries = await PRXBaseIE.entriesPaged(base, `query ${query}`, 'series/search', (r) => base._seriesPlaylistEntry(r), { q: query });
    return entries.slice(0, n);
  }
}
