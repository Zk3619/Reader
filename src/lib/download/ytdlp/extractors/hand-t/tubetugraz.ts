/** TubeTuGrazIE / TubeTuGrazSeriesIE — ported from yt-dlp tubetugraz.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, str_or_none, traverse_obj } from '../../utils';
import { parse_resolution, urlencodePostdata } from './_helpers';

function variadic<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export class TubeTuGrazBaseIE extends InfoExtractor {
  static IE_NAME = 'tubetugrazbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _API_EPISODE = 'https://tube.tugraz.at/search/episode.json';
  protected _FORMAT_TYPES = ['presentation', 'presenter'] as const;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TubeTuGrazBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    const urlh = await this._request_webpage(
      'https://tube.tugraz.at/Shibboleth.sso/Login?target=/paella/ui/index.html',
      undefined,
      'downloading login page',
      { fatal: false },
    );
    if (!urlh) return;

    const response = await this._request_webpage(
      {
        url: urlh.url,
        data: urlencodePostdata({
          lang: 'de',
          _eventId_proceed: '',
          j_username: username,
          j_password: password,
        }),
        headers: { referer: urlh.url },
      },
      undefined,
      'logging in',
      { fatal: false },
    );
    if (!response) return;
    if (response.url === 'https://tube.tugraz.at/paella/ui/index.html') return;

    if (
      !this._html_search_regex(
        /<p\b[^>]*>(Bitte geben Sie einen OTP-Wert ein:)<\/p>/,
        response.text,
        'TFA prompt',
        undefined,
        false,
      )
    ) {
      this.report_warning('unable to login: incorrect password');
    }
  }

  protected *_setFormatType(formats: Format[], fmtType: string): Generator<Format> {
    for (const f of formats) {
      f.format_note = fmtType;
      if (!fmtType.startsWith(this._FORMAT_TYPES[0]!)) f.preference = -2;
      yield f;
    }
  }

  protected async *_extractFormats(
    formatList: Array<Record<string, unknown>> | undefined,
    videoId: string,
  ): AsyncGenerator<Format> {
    let hasHls = false;
    let hasDash = false;

    for (const formatInfo of formatList || []) {
      const rawUrl = traverse_obj(formatInfo, ['tags', 'url']) ?? formatInfo.url;
      if (rawUrl == null) continue;
      const fmtType = String(formatInfo.type || 'unknown');
      const transport = String(formatInfo.transport || 'https').toLowerCase();
      let formats: Format[] = [];

      if (transport === 'https') {
        formats = [
          {
            url: String(rawUrl),
            format_id: fmtType,
            abr: float_or_none(traverse_obj(formatInfo, ['audio', 'bitrate']), 1000) ?? undefined,
            vbr: float_or_none(traverse_obj(formatInfo, ['video', 'bitrate']), 1000) ?? undefined,
            fps: (traverse_obj(formatInfo, ['video', 'framerate']) as number | undefined) ?? undefined,
            ...parse_resolution(String(traverse_obj(formatInfo, ['video', 'resolution']) || '')),
          },
        ];
      } else if (transport === 'hls') {
        hasHls = true;
        formats = await this._extract_m3u8_formats(
          String(rawUrl),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          fmtType,
          undefined,
          false,
        );
      } else if (transport === 'dash') {
        hasDash = true;
        formats = await this._extract_mpd_formats(String(rawUrl), videoId, fmtType, undefined, false);
      } else {
        continue;
      }
      yield* this._setFormatType(formats, fmtType);
    }

    for (const fmtType of this._FORMAT_TYPES) {
      if (!hasHls) {
        const hlsFormats = await this._extract_m3u8_formats(
          `https://wowza.tugraz.at/matterhorn_engage/smil:engage-player_${videoId}_${fmtType}.smil/playlist.m3u8`,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          fmtType,
          undefined,
          false,
        );
        yield* this._setFormatType(hlsFormats, fmtType);
      }
      if (!hasDash) {
        const dashFormats = await this._extract_mpd_formats(
          `https://wowza.tugraz.at/matterhorn_engage/smil:engage-player_${videoId}_${fmtType}.smil/manifest_mpm4sav_mvlist.mpd`,
          videoId,
          fmtType,
          undefined,
          false,
        );
        yield* this._setFormatType(dashFormats, fmtType);
      }
    }
  }

  protected async _extractEpisode(episodeInfo: Record<string, unknown>): Promise<VideoInfo> {
    const videoId = String(episodeInfo.id || '');
    const tracks = traverse_obj(episodeInfo, ['mediapackage', 'media', 'track']) as
      | Array<Record<string, unknown>>
      | undefined;
    const formats: Format[] = [];
    for await (const fmt of this._extractFormats(tracks, videoId)) formats.push(fmt);

    const title =
      str_or_none(traverse_obj(episodeInfo, ['mediapackage', 'title'])) ||
      str_or_none(episodeInfo.dcTitle) ||
      `TubeTuGraz video #${videoId}`;
    const seriesTitle = str_or_none(traverse_obj(episodeInfo, ['mediapackage', 'seriestitle']));
    const creators = variadic(
      traverse_obj(episodeInfo, ['mediapackage', 'creators', 'creator']) ?? episodeInfo.dcCreator ?? '',
    );

    return {
      id: videoId,
      title,
      creator: creators.map(String).filter(Boolean).join(', ') || undefined,
      duration:
        (traverse_obj(episodeInfo, ['mediapackage', 'duration']) as number | undefined) ??
        (episodeInfo.dcExtent as number | undefined),
      series: seriesTitle ?? undefined,
      series_id:
        str_or_none(traverse_obj(episodeInfo, ['mediapackage', 'series'])) ||
        str_or_none(episodeInfo.dcIsPartOf) ||
        undefined,
      episode: seriesTitle ? title : undefined,
      formats,
    };
  }
}

export class TubeTuGrazIE extends TubeTuGrazBaseIE {
  static IE_NAME = 'tubetugraz';
  static _VALID_URL =
    /https?:\/\/tube\.tugraz\.at\/(?:paella\/ui\/watch\.html\?(?:[^#]*&)?id=|portal\/watch\/)(?<id>[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const episodeData = await this._download_json<Record<string, unknown>>(
      this._API_EPISODE,
      videoId,
      undefined,
      { query: { id: videoId, limit: '1' } },
    );
    const results = traverse_obj(episodeData, ['search-results', 'result']) as
      | Array<Record<string, unknown>>
      | undefined;
    return this._extractEpisode(results?.[0] || { id: videoId });
  }
}

export class TubeTuGrazSeriesIE extends TubeTuGrazBaseIE {
  static IE_NAME = 'tubetugraz:series';
  static _VALID_URL =
    /https?:\/\/tube\.tugraz\.at\/paella\/ui\/browse\.html\?series=(?<id>[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const episodesData = await this._download_json<Record<string, unknown>>(
      this._API_EPISODE,
      playlistId,
      undefined,
      { query: { sid: playlistId } },
    );
    const seriesData = await this._download_json<Record<string, unknown>>(
      'https://tube.tugraz.at/series/series.json',
      playlistId,
      undefined,
      { fatal: false, query: { seriesId: playlistId, count: '1', sort: 'TITLE' } },
    );

    const results =
      (traverse_obj(episodesData, ['search-results', 'result']) as Array<Record<string, unknown>>) ||
      [];
    const entries: VideoInfo[] = [];
    for (const ep of results) entries.push(await this._extractEpisode(ep));

    const title = str_or_none(
      traverse_obj(seriesData, ['catalogs', 0, 'http://purl.org/dc/terms/', 'title', 0, 'value']),
    );

    return this.playlist_result(entries, playlistId, title ?? undefined);
  }
}
