/**
 * AmazonMiniTVIE / AmazonMiniTVSeasonIE / AmazonMiniTVSeriesIE
 * — aligned with yt-dlp amazonminitv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, traverse_obj, try_get, url_or_none } from '../../utils';

const DEVICE = { clientId: 'ATVIN', deviceLocale: 'en_GB' };

function parseCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || '';
  }
  return null;
}

abstract class AmazonMiniTVBaseIE extends InfoExtractor {
  static sessionId: string | null = null;

  protected async ensureSession(): Promise<string> {
    if (AmazonMiniTVBaseIE.sessionId) return AmazonMiniTVBaseIE.sessionId;
    await this._download_webpage('https://www.amazon.in/minitv', undefined, 'Fetching guest session cookies');
    const headers = await this._buildHeaders('https://www.amazon.in');
    const sessionId = parseCookieValue(headers.Cookie || '', 'session-id');
    if (!sessionId) {
      throw new ExtractorError('Unable to obtain Amazon MiniTV session-id', { expected: true });
    }
    AmazonMiniTVBaseIE.sessionId = sessionId;
    return sessionId;
  }

  protected async callApi(
    asin: string,
    data?: Record<string, unknown> | null,
    note?: string,
  ): Promise<Record<string, unknown>> {
    await this.ensureSession();
    const sessionId = AmazonMiniTVBaseIE.sessionId!;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      currentpageurl: '/',
      currentplatform: 'dWeb',
    };

    if (data) {
      const variables = (data.variables as Record<string, unknown>) || {};
      data.variables = {
        ...variables,
        contentType: 'VOD',
        sessionIdToken: sessionId,
        ...DEVICE,
      };
    }

    const resp = await this._download_json<Record<string, unknown>>(
      `https://www.amazon.in/minitv/api/web/${data ? 'graphql' : 'prs'}`,
      asin,
      note,
      {
        headers,
        data: data ? JSON.stringify(data) : undefined,
        method: data ? 'POST' : 'GET',
        query: data
          ? undefined
          : {
              deviceType: 'A1WMMUXPCUJL4N',
              contentId: asin,
              ...DEVICE,
            },
      },
    );

    const errors = resp.errors as Array<{ message?: string }> | undefined;
    if (errors?.length) {
      throw new ExtractorError(`MiniTV said: ${errors[0]?.message || 'unknown error'}`, {
        expected: true,
      });
    }
    if (!data) return resp;
    return (resp.data as Record<string, Record<string, unknown>>)?.[
      String(data.operationName)
    ] as Record<string, unknown>;
  }
}

const GRAPHQL_QUERY_CONTENT = `
query content($sessionIdToken: String!, $deviceLocale: String, $contentId: ID!, $contentType: ContentType!, $clientId: String) {
  content(
    applicationContextInput: {deviceLocale: $deviceLocale, sessionIdToken: $sessionIdToken, clientId: $clientId}
    contentId: $contentId
    contentType: $contentType
  ) {
    contentId
    name
    ... on Episode {
      contentId
      vodType
      name
      images
      description {
        synopsis
        contentLengthInSeconds
      }
      publicReleaseDateUTC
      audioTracks
      seasonId
      seriesId
      seriesName
      seasonNumber
      episodeNumber
      timecode {
        endCreditsTime
      }
    }
    ... on MovieContent {
      contentId
      vodType
      name
      description {
        synopsis
        contentLengthInSeconds
      }
      images
      publicReleaseDateUTC
      audioTracks
    }
  }
}`;

export class AmazonMiniTVIE extends AmazonMiniTVBaseIE {
  static IE_NAME = 'amazonminitv';
  static _VALID_URL =
    /(?:https?:\/\/(?:www\.)?amazon\.in\/minitv\/tp\/|amazonminitv:(?:amzn1\.dv\.gti\.)?)(?<id>[a-f0-9-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const asin = `amzn1.dv.gti.${this._match_id(url)}`;
    const prs = await this.callApi(asin, null, 'Downloading playback info');

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const playbackAssets = (prs.playbackAssets as Record<string, Record<string, unknown>>) || {};

    for (const [type_, asset] of Object.entries(playbackAssets)) {
      const manifestUrl = url_or_none(asset.manifestUrl);
      if (!manifestUrl) continue;
      if (type_ === 'hls') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            manifestUrl,
            asin,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            type_,
            undefined,
            false,
          )),
        );
      } else if (type_ === 'dash') {
        formats.push(...(await this._extract_mpd_formats(manifestUrl, asin, type_, undefined, false)));
      } else {
        this.report_warning(`Unknown asset type: ${type_}`);
      }
    }

    const titleInfo = await this.callApi(asin, {
      operationName: 'content',
      variables: { contentId: asin },
      query: GRAPHQL_QUERY_CONTENT,
    }, 'Downloading title info');

    const creditsTime = try_get(titleInfo, (x: Record<string, unknown>) => {
      const tc = x.timecode as Record<string, unknown> | undefined;
      return tc?.endCreditsTime != null ? Number(tc.endCreditsTime) / 1000 : null;
    });
    const isEpisode = titleInfo.vodType === 'EPISODE';
    const images = (titleInfo.images as Record<string, string>) || {};
    const thumbnails: Thumbnail[] = Object.entries(images).map(([id, imageUrl]) => ({
      id,
      url: imageUrl,
    }));

    return {
      id: asin,
      title: (titleInfo.name as string | undefined) ?? undefined,
      formats,
      subtitles,
      language: traverse_obj(titleInfo, ['audioTracks', 0]) as string | undefined,
      thumbnails,
      description: traverse_obj(titleInfo, ['description', 'synopsis']) as string | undefined,
      release_timestamp: int_or_none(
        try_get(titleInfo, (x: Record<string, unknown>) =>
          x.publicReleaseDateUTC != null ? Number(x.publicReleaseDateUTC) / 1000 : null,
        ),
      ),
      duration: traverse_obj(titleInfo, ['description', 'contentLengthInSeconds']) as
        | number
        | undefined,
      chapters: creditsTime
        ? [{ start_time: creditsTime, title: 'End Credits' }]
        : [],
      series: (titleInfo.seriesName as string | undefined) ?? undefined,
      series_id: (titleInfo.seriesId as string | undefined) ?? undefined,
      season_number: titleInfo.seasonNumber as number | undefined,
      season_id: (titleInfo.seasonId as string | undefined) ?? undefined,
      episode: isEpisode ? ((titleInfo.name as string | undefined) ?? undefined) : undefined,
      episode_number: titleInfo.episodeNumber as number | undefined,
      episode_id: isEpisode ? asin : undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'amazonminitv',
      extractor_key: 'AmazonMiniTV',
    };
  }
}

const GRAPHQL_QUERY_EPISODES = `
query getEpisodes($sessionIdToken: String!, $clientId: String, $episodeOrSeasonId: ID!, $deviceLocale: String) {
  getEpisodes(
    applicationContextInput: {sessionIdToken: $sessionIdToken, deviceLocale: $deviceLocale, clientId: $clientId}
    episodeOrSeasonId: $episodeOrSeasonId
  ) {
    episodes {
      ... on Episode {
        contentId
        name
        images
        seriesName
        seasonId
        seriesId
        seasonNumber
        episodeNumber
        description {
          synopsis
          contentLengthInSeconds
        }
        publicReleaseDateUTC
      }
    }
  }
}`;

export class AmazonMiniTVSeasonIE extends AmazonMiniTVBaseIE {
  static IE_NAME = 'amazonminitv:season';
  static IE_DESC = 'Amazon MiniTV Season, "minitv:season:" prefix';
  static _VALID_URL = /amazonminitv:season:(?:amzn1\.dv\.gti\.)?(?<id>[a-f0-9-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const asin = `amzn1.dv.gti.${this._match_id(url)}`;
    const seasonInfo = await this.callApi(asin, {
      operationName: 'getEpisodes',
      variables: { episodeOrSeasonId: asin },
      query: GRAPHQL_QUERY_EPISODES,
    }, 'Downloading season info');

    const entries = ((seasonInfo.episodes as Record<string, unknown>[]) || []).map((episode) =>
      this.url_result(
        `amazonminitv:${episode.contentId}`,
        'AmazonMiniTV',
        String(episode.contentId || ''),
      ),
    );

    return this.playlist_result(entries, asin);
  }
}

const GRAPHQL_QUERY_SEASONS = `
query getSeasons($sessionIdToken: String!, $deviceLocale: String, $episodeOrSeasonOrSeriesId: ID!, $clientId: String) {
  getSeasons(
    applicationContextInput: {deviceLocale: $deviceLocale, sessionIdToken: $sessionIdToken, clientId: $clientId}
    episodeOrSeasonOrSeriesId: $episodeOrSeasonOrSeriesId
  ) {
    seasons {
      seasonId
    }
  }
}`;

export class AmazonMiniTVSeriesIE extends AmazonMiniTVBaseIE {
  static IE_NAME = 'amazonminitv:series';
  static IE_DESC = 'Amazon MiniTV Series, "minitv:series:" prefix';
  static _VALID_URL = /amazonminitv:series:(?:amzn1\.dv\.gti\.)?(?<id>[a-f0-9-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const asin = `amzn1.dv.gti.${this._match_id(url)}`;
    const seriesInfo = await this.callApi(asin, {
      operationName: 'getSeasons',
      variables: { episodeOrSeasonOrSeriesId: asin },
      query: GRAPHQL_QUERY_SEASONS,
    }, 'Downloading series info');

    const entries = ((seriesInfo.seasons as Record<string, unknown>[]) || []).map((season) =>
      this.url_result(
        `amazonminitv:season:${season.seasonId}`,
        'AmazonMiniTVSeason',
        String(season.seasonId || ''),
      ),
    );

    return this.playlist_result(entries, asin);
  }
}
