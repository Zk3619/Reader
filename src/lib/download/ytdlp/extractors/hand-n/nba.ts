/**
 * NBA family — ported from yt-dlp nba.py (watch main path; CVP/Turner edges simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, parse_qs, update_url_query } from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

export class NBACVPBaseIE extends InfoExtractor {
  static IE_NAME = 'nbacvpbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NBACVPBaseIE is not a standalone extractor', { expected: true });
  }
}

export class NBAWatchBaseIE extends NBACVPBaseIE {
  static IE_NAME = 'nbawatchbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _VALID_URL_BASE =
    /https?:\/\/(?:(?:www\.)?nba\.com(?:\/watch)?|watch\.nba\.com)\//;

  protected async _extractVideo(filterKey: string, filterValue: string): Promise<VideoInfo> {
    const solr = await this._download_json<Record<string, unknown>>(
      'https://neulionscnbav2-a.akamaihd.net/solr/nbad_program/usersearch',
      filterValue,
      undefined,
      {
        query: {
          fl: 'description,image,name,pid,releaseDate,runtime,tags,seoName',
          q: `${filterKey}:${filterValue}`,
          wt: 'json',
        },
      },
    );
    const video = ((solr.response as Record<string, unknown>)?.docs as Array<Record<string, unknown>>)?.[0];
    if (!video) throw new ExtractorError('Video not found in NBA catalog');

    const videoId = String(video.pid);
    const formats: Format[] = [];

    const publish = await this._download_json<{ path?: string }>(
      'https://watch.nba.com/service/publishpoint',
      videoId,
      undefined,
      {
        query: { type: 'video', format: 'json', id: videoId },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0_1 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A402 Safari/604.1',
        },
        fatal: false,
      },
    );
    const m3u8Url = publish?.path?.replace(/_(?:pc|iphone)\./, '.');
    if (m3u8Url) {
      const m3u8Formats = await this._extract_m3u8_formats(
        m3u8Url,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      formats.push(...m3u8Formats);
      for (const f of m3u8Formats) {
        formats.push({
          ...f,
          format_id: (f.format_id || 'hls').replace('hls-', 'http-'),
          protocol: 'http',
          url: (f.url || '').replace('.m3u8', ''),
        });
      }
    }

    return {
      id: videoId,
      title: String(video.name ?? videoId),
      thumbnail: video.image ? urljoin('https://nbadsdmt.akamaized.net/media/nba/nba/thumbs/', String(video.image)) : undefined,
      description: video.description as string | undefined,
      duration: int_or_none(video.runtime) ?? undefined,
      timestamp: parseIso8601(video.releaseDate) ?? undefined,
      tags: video.tags as string[] | undefined,
      formats,
    };
  }
}

export class NBAWatchEmbedIE extends NBAWatchBaseIE {
  static IE_NAME = 'nba:watch:embed';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?nba\.com(?:\/watch)?|watch\.nba\.com)\/embed\?.*?\bid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractVideo('pid', this._match_id(url));
  }
}

export class NBAWatchIE extends NBAWatchBaseIE {
  static IE_NAME = 'nba:watch';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?nba\.com(?:\/watch)?|watch\.nba\.com)\/(?:nba\/)?video\/(?<id>.+?(?=\/index\.html)|(?:[^/]+\/)*[^/?#&]+)/;

  protected _yesPlaylist(playlistId: string | undefined, _videoId: string): boolean {
    return !!playlistId;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const collectionId = parse_qs(url).collection?.[0];
    if (collectionId && this._yesPlaylist(collectionId, displayId)) {
      return this.url_result(
        `https://www.nba.com/watch/list/collection/${collectionId}`,
        'NBAWatchCollection',
        collectionId,
      ) as VideoInfo;
    }
    return this._extractVideo('seoName', displayId);
  }
}

export class NBAWatchCollectionIE extends NBAWatchBaseIE {
  static IE_NAME = 'nba:watch:collection';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?nba\.com(?:\/watch)?|watch\.nba\.com)\/list\/collection\/(?<id>[^/?#&]+)/;
  static _PAGE_SIZE = 100;

  protected async *_fetchPage(collectionId: string, page: number): AsyncGenerator<VideoInfo> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://content-api-prod.nba.com/public/1/endeavor/video-list/collection/${collectionId}`,
      collectionId,
      `Downloading page ${page + 1} JSON metadata`,
      { query: { count: String(NBAWatchCollectionIE._PAGE_SIZE), page: String(page + 1) } },
    );
    for (const video of ((resp.results as Record<string, unknown>)?.videos as Array<Record<string, unknown>>) || []) {
      const program = (video.program as Record<string, unknown>) || {};
      const seoName = (program.seoName as string) || (program.slug as string);
      if (!seoName) continue;
      yield {
        _type: 'url',
        id: program.id as string | undefined,
        title: (program.title as string) || (video.title as string),
        url: `https://www.nba.com/watch/video/${seoName}`,
        thumbnail: video.image as string | undefined,
        description: (program.description as string) || (video.description as string),
        duration: parse_duration(program.runtimeHours as string | undefined) ?? undefined,
        timestamp: parseIso8601(video.releaseDate) ?? undefined,
      } as VideoInfo;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const collectionId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(collectionId, page)) {
        entries.push(entry);
        count++;
      }
      if (count < NBAWatchCollectionIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, collectionId);
  }
}

export class NBABaseIE extends NBACVPBaseIE {
  static IE_NAME = 'nbabase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _VALID_URL_BASE =
    /https?:\/\/(?:www\.)?nba\.com\/(?<team>blazers|bucks|bulls|cavaliers|celtics|clippers|grizzlies|hawks|heat|hornets|jazz|kings|knicks|lakers|magic|mavericks|nets|nuggets|pacers|pelicans|pistons|raptors|rockets|sixers|spurs|suns|thunder|timberwolves|warriors|wizards)(?:\/play#)?\//;

  protected _embedUrlResult(team: string, contentId: string): VideoInfo {
    return this.url_result(
      update_url_query('https://secure.nba.com/assets/amp/include/video/iframe.html', {
        contentId,
        team,
      }),
      'NBAEmbed',
    ) as VideoInfo;
  }

  protected async _callApi(team: string, contentId: string, query: Record<string, string>): Promise<Array<Record<string, unknown>>> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://api.nba.net/2/${team}/video,imported_video,wsc/`,
      contentId,
      `Download JSON metadata`,
      {
        query,
        headers: { accessToken: 'internal|bb88df6b4c2244e78822812cecf1ee1b' },
      },
    );
    return ((resp.response as Record<string, unknown>)?.result as Array<Record<string, unknown>>) || [];
  }
}

export class NBAEmbedIE extends NBABaseIE {
  static IE_NAME = 'nba:embed';
  static _VALID_URL =
    /https?:\/\/secure\.nba\.com\/assets\/amp\/include\/video\/(?:topI|i)frame\.html\?.*?\bcontentId=(?<id>[^?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const contentId = qs.contentId?.[0] || this._match_id(url);
    const team = qs.team?.[0];
    if (!team) {
      return this.url_result(`https://watch.nba.com/video/${contentId}`, 'NBAWatch') as VideoInfo;
    }
    const video = (await this._callApi(team, contentId, { videoid: contentId }))[0];
    if (!video) throw new ExtractorError('Video not found');
    return this._extractVideoRecord(video);
  }

  protected async _extractVideoRecord(video: Record<string, unknown>): Promise<VideoInfo> {
    const videoId = String(video.nid ?? '');
    const formats: Format[] = [];
    const mp4Url = video.mp4 as string | undefined;
    if (mp4Url) formats.push({ format_id: 'mp4', url: mp4Url });
    const m3u8Url = video.m3u8 as string | undefined;
    if (m3u8Url) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          m3u8Url,
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
    }
    return {
      id: videoId,
      title: (video.title as string) || (video.headline as string) || (video.shortHeadline as string),
      description: video.description as string | undefined,
      timestamp: parseIso8601(video.published) ?? undefined,
      formats,
    };
  }
}

export class NBAIE extends NBABaseIE {
  static IE_NAME = 'nba';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nba\.com\/(?<team>blazers|bucks|bulls|cavaliers|celtics|clippers|grizzlies|hawks|heat|hornets|jazz|kings|knicks|lakers|magic|mavericks|nets|nuggets|pacers|pelicans|pistons|raptors|rockets|sixers|spurs|suns|thunder|timberwolves|warriors|wizards)(?:\/play#)?\/(?!video\/channel|series)video\/(?<id>(?:[^/]+\/)*[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const team = m.groups?.team ?? '';
    let displayId = m.groups?.id ?? '';
    if (url.includes('/play#/')) {
      displayId = decodeURIComponent(displayId);
    } else {
      const webpage = await this._download_webpage(url, displayId);
      displayId = this._search_regex(/videoID\s*:\s*"([^"]+)"/, webpage, 'video id')!;
    }
    return this._embedUrlResult(team, displayId);
  }
}

export class NBAChannelIE extends NBABaseIE {
  static IE_NAME = 'nba:channel';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nba\.com\/(?<team>blazers|bucks|bulls|cavaliers|celtics|clippers|grizzlies|hawks|heat|hornets|jazz|kings|knicks|lakers|magic|mavericks|nets|nuggets|pacers|pelicans|pistons|raptors|rockets|sixers|spurs|suns|thunder|timberwolves|warriors|wizards)(?:\/play#)?\/(?:video\/channel|series)\/(?<id>[^/?#&]+)/;
  static _PAGE_SIZE = 100;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const team = m.groups?.team ?? '';
    const channel = m.groups?.id ?? '';
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const results = await this._callApi(team, channel, {
        channels: channel,
        count: String(NBAChannelIE._PAGE_SIZE),
        offset: String(page * NBAChannelIE._PAGE_SIZE),
      });
      if (!results.length) break;
      for (const video of results) {
        entries.push(this._embedUrlResult(String(video.brand ?? team), String(video.videoId ?? video.nid ?? '')));
      }
      if (results.length < NBAChannelIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, channel, channel);
  }
}
