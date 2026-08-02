/**
 * ERT (Greek public broadcaster) — ported from yt-dlp ertgr.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  dict_get,
  int_or_none,
  merge_dicts,
  parse_qs,
  str_or_none,
  try_get,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

export class ERTFlixBaseIE extends InfoExtractor {
  static IE_NAME = 'ertflixbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ERTFlixBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    videoId: string,
    method = 'Player/AcquireContent',
    apiVersion = 1,
    params: Record<string, string> = {},
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const platformCodename = { platformCodename: 'www' };
    const headersAsParam: Record<string, string> = {
      'X-Api-Date-Format': 'iso',
      'X-Api-Camel-Case': 'false',
    };
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (data) {
      headers['Content-Type'] = 'application/json;charset=utf-8';
      headersAsParam['Content-Type'] = 'application/json;charset=utf-8';
      body = JSON.stringify(merge_dicts(platformCodename, data));
    }
    const query: Record<string, string> = {
      ...(body ? {} : { platformCodename: 'www' }),
      $headers: JSON.stringify(headersAsParam),
      ...params,
    };
    const response = await this._download_json<{ Result?: { Success?: boolean }; Tiles?: unknown[] }>(
      `https://api.app.ertflix.gr/v${apiVersion}/${method}`,
      videoId,
      undefined,
      { fatal: false, query, data: body, method: body ? 'POST' : 'GET', headers },
    );
    if (response?.Result?.Success === true) return response as Record<string, unknown>;
    return null;
  }

  protected async _callApiGetTiles(videoId: string, ...tileIds: string[]): Promise<Record<string, unknown>> {
    const requestedTileIds = [videoId, ...tileIds];
    const tilesResponse = await this._callApi(videoId, 'Tile/GetTiles', 2, {}, {
      RequestedTiles: requestedTileIds.map((id) => ({ Id: id })),
    });
    const tiles = (try_get(tilesResponse, [(x) => x.Tiles as unknown[]], Array.isArray) as Record<string, unknown>[]) || [];
    if (tileIds.length) {
      const got = tiles.map((t) => t.Id).sort();
      const want = [...requestedTileIds].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new ExtractorError('Requested tiles not found', { expected: true });
      }
      return { tiles };
    }
    const tile = tiles.find((t) => t.Id === videoId);
    if (!tile) throw new ExtractorError('No matching tile found', { expected: true });
    return tile;
  }
}

export class ERTFlixCodenameIE extends ERTFlixBaseIE {
  static IE_NAME = 'ertflix:codename';
  static IE_DESC = 'ERTFLIX videos by codename';
  static _VALID_URL = /ertflix:(?<id>[\w-]+)/;

  protected async _extractFormatsAndSubs(videoId: string) {
    const mediaInfo = await this._callApi(videoId, 'Player/AcquireContent', 1, { codename: videoId });
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const mediaFiles = (mediaInfo?.MediaFiles as Record<string, unknown>[]) || [];
    for (const mediaFile of mediaFiles) {
      if (mediaFile.RoleCodename !== 'main') continue;
      const formatList = (mediaFile.Formats as Record<string, unknown>[]) || [];
      for (const media of formatList) {
        const fmtUrl = url_or_none(media.Url);
        if (!fmtUrl) continue;
        const ext = determine_ext(fmtUrl);
        if (ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, fmtUrl, videoId, 'hls');
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else if (ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(fmtUrl, videoId, 'dash', undefined, false)));
        } else {
          formats.push({ url: fmtUrl, format_id: str_or_none(media.Id) || 'http' });
        }
      }
    }
    return { formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const { formats, subtitles } = await this._extractFormatsAndSubs(videoId);
    if (!formats.length) throw new ExtractorError('No formats found', { expected: true });
    return {
      id: videoId,
      formats,
      subtitles,
      title: videoId,
    };
  }
}

function parseAgeRating(info: Record<string, unknown>): number | undefined {
  if (info.AgeRating != null) {
    const n = Number(info.AgeRating);
    if (Number.isFinite(n)) return n;
  }
  if (info.IsAdultContent) return 18;
  if (info.IsKidsContent) return 0;
  return undefined;
}

export class ERTFlixIE extends ERTFlixBaseIE {
  static IE_NAME = 'ertflix';
  static IE_DESC = 'ERTFLIX videos';
  static _VALID_URL = /https?:\/\/www\.ertflix\.gr\/(?:[^/]+\/)?(?:series|vod)\/(?<id>[a-z]{3}\.\d+)/;

  protected _extractEpisode(episode: Record<string, unknown>): VideoInfo | null {
    const codename = try_get(episode, [(x) => x.Codename as string], (v) => typeof v === 'string');
    const title = episode.Title as string | undefined;
    const description = clean_html(dict_get(episode, 'ShortDescription', 'TinyDescription') as string) ?? undefined;
    if (!codename || !title || episode.HasPlayableStream === false) return null;

    const images = dict_get(episode, 'Images', 'Image');
    const imageList = Array.isArray(images) ? images : images ? [images] : [];
    const thumbnail =
      imageList
        .map((thumb) => (thumb && typeof thumb === 'object' ? url_or_none((thumb as Record<string, unknown>).Url) : null))
        .find((u, i) => u && (imageList[i] as Record<string, unknown>)?.IsMain) || undefined;

    return {
      _type: 'url',
      thumbnail,
      id: codename,
      episode_id: (episode.Id as string) || undefined,
      title,
      alt_title: (episode.Subtitle as string) || undefined,
      description,
      timestamp: parseIso8601(episode.PublishDate) ?? undefined,
      duration: int_or_none(episode.DurationSeconds) ?? undefined,
      age_limit: parseAgeRating(episode),
      url: `ertflix:${codename}`,
      extractor: 'ERTFlixCodename',
      extractor_key: 'ERTFlixCodename',
    };
  }

  protected async _extractSeries(
    videoId: string,
    seasonTitles?: string[] | null,
    seasonNumbers?: number[] | null,
  ): Promise<VideoInfo> {
    const mediaInfo = await this._callApi(videoId, 'Tile/GetSeriesDetails', 1, { id: videoId });
    const series = (mediaInfo?.Series as Record<string, unknown>) || {};
    const seriesInfo = {
      age_limit: parseAgeRating(series),
      title: (series.Title as string) || undefined,
      description: (dict_get(series, 'ShortDescription', 'TinyDescription') as string) || undefined,
    };

    let titles = seasonTitles ? [...seasonTitles] : [];
    if (seasonNumbers?.length) {
      const seasons = (series.Seasons as Record<string, unknown>[]) || [];
      for (const season of seasons) {
        if (seasonNumbers.includes(Number(season.SeasonNumber)) && season.Title) {
          titles.push(String(season.Title));
        }
      }
    }

    const entries: VideoInfo[] = [];
    const episodeGroups = (mediaInfo?.EpisodeGroups as Record<string, unknown>[]) || [];
    for (const episodeGroup of episodeGroups) {
      if (titles.length && episodeGroup.Title && !titles.includes(String(episodeGroup.Title))) continue;
      const episodes = (episodeGroup.Episodes as Record<string, unknown>[]) || [];
      if (!episodes.length) continue;
      const seasonInfo = {
        season: (episodeGroup.Title as string) || undefined,
        season_number: int_or_none(episodeGroup.SeasonNumber) ?? undefined,
      };
      let numbered: Array<[number, Record<string, unknown>]>;
      try {
        numbered = episodes.map((ep) => [Number(ep.EpisodeNumber), ep] as [number, Record<string, unknown>]);
        numbered.sort((a, b) => a[0] - b[0]);
      } catch {
        numbered = episodes.map((ep, i) => [i + 1, ep] as [number, Record<string, unknown>]);
      }
      for (const [n, episode] of numbered) {
        const info = this._extractEpisode(episode);
        if (!info) continue;
        entries.push({ ...info, episode_number: n, ...seasonInfo });
      }
    }

    return this.playlist_result(entries, videoId, seriesInfo.title, seriesInfo.description);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    if (videoId.startsWith('ser.')) {
      const qs = parse_qs(url);
      const paramSeason = qs.season || [];
      const parsed = paramSeason
        .map((ps) => {
          const num = int_or_none(ps);
          return { isNum: num != null, value: num ?? ps };
        })
        .filter((x) => x.value != null);
      const seasonNumbers = parsed.filter((x) => x.isNum).map((x) => Number(x.value));
      const seasonTitles = parsed.filter((x) => !x.isNum).map((x) => String(x.value));
      return this._extractSeries(
        videoId,
        seasonTitles.length ? seasonTitles : null,
        seasonNumbers.length ? seasonNumbers : null,
      );
    }

    const tile = await this._callApiGetTiles(videoId);
    const episode = this._extractEpisode(tile);
    if (!episode) throw new ExtractorError('No playable episode found', { expected: true });
    return episode;
  }
}

export class ERTWebtvEmbedIE extends InfoExtractor {
  static IE_NAME = 'ertwebtv:embed';
  static IE_DESC = 'ert.gr webtv embedded videos';
  static _VALID_URL =
    /https?:\/\/www\.ert\.gr\/webtv\/live-uni\/vod\/dt-uni-vod\.php\?([^#]+&)?f=(?<id>[^#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `https://mediastream.ert.gr/vodedge/_definst_/mp4:dvrorigin/${videoId}/playlist.m3u8`,
      videoId,
      'hls',
    );
    const qs = parse_qs(url);
    let thumbnail = qs.bgimg?.[0];
    if (thumbnail && !thumbnail.startsWith('http')) {
      thumbnail = `https://program.ert.gr${thumbnail}`;
    }
    return {
      id: videoId,
      title: `VOD - ${videoId}`,
      thumbnail,
      formats,
      subtitles,
    };
  }
}
