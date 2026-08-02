/**
 * MLB family — ported from yt-dlp mlb.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  parse_duration,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  mergeSubtitles,
  parseIso8601,
  playlistFromMatches,
} from './_helpers';

function extractMlbSubtitlesLegacy(feed: Record<string, unknown>, language: string): Record<string, Subtitle[]> {
  const subtitles: Record<string, Subtitle[]> = {};
  for (const keyword of (feed.keywordsAll as Array<Record<string, unknown>>) || []) {
    const keywordType = str_or_none(keyword.type);
    if (keywordType?.startsWith('closed_captions_location_')) {
      const ccLocation = str_or_none(keyword.value);
      if (ccLocation) {
        if (!subtitles[language]) subtitles[language] = [];
        subtitles[language]!.push({ url: ccLocation, ext: 'vtt' });
      }
    }
  }
  return subtitles;
}

function extractMlbSubtitlesModern(feed: Record<string, unknown>, language: string): Record<string, Subtitle[]> {
  const subtitles: Record<string, Subtitle[]> = {};
  for (const ccLocation of (feed.closedCaptions as string[]) || []) {
    if (!subtitles[language]) subtitles[language] = [];
    subtitles[language]!.push({ url: ccLocation, ext: 'vtt' });
  }
  return subtitles;
}

export class MLBBaseIE extends InfoExtractor {
  static IE_NAME = 'mlbbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _TIMESTAMP_KEY = 'date';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const video = await this._downloadVideoData(displayId);
    const videoId = String(video.id ?? displayId);
    const title = str_or_none(video.title) || videoId;
    const feed = this._getFeed(video);
    const language = (str_or_none(video.language) || 'EN').toLowerCase();

    const formats: Format[] = [];
    for (const playback of (feed.playbacks as Array<Record<string, unknown>>) || []) {
      const playbackUrl = str_or_none(playback.url);
      if (!playbackUrl) continue;
      const name = str_or_none(playback.name) || 'http';
      const ext = determine_ext(playbackUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            playbackUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            name,
            undefined,
            false,
          )),
        );
      } else {
        const f: Format = { format_id: name, url: playbackUrl };
        const mobj = name.match(/_(\d+)K_(\d+)X(\d+)/);
        if (mobj) {
          f.height = Number(mobj[3]);
          f.tbr = Number(mobj[1]);
          f.width = Number(mobj[2]);
        }
        const urlM = playbackUrl.match(/_(\d+)x(\d+)_(\d+)_(\d+)K\.mp4/);
        if (urlM) {
          f.fps = Number(urlM[3]);
          f.height = Number(urlM[2]);
          f.tbr = Number(urlM[4]);
          f.width = Number(urlM[1]);
        }
        formats.push(f);
      }
    }

    const thumbnails: Thumbnail[] = [];
    const image = (feed.image as Record<string, unknown>) || {};
    for (const cut of (image.cuts as Array<Record<string, unknown>>) || []) {
      const src = str_or_none(cut.src);
      if (!src) continue;
      thumbnails.push({
        url: src,
        height: int_or_none(cut.height) ?? undefined,
        width: int_or_none(cut.width) ?? undefined,
      });
    }

    return {
      id: videoId,
      title,
      formats,
      description: str_or_none(video.description) ?? undefined,
      duration: parse_duration(feed.duration) ?? undefined,
      thumbnails,
      timestamp:
        parseIso8601(video[(this.constructor as typeof MLBBaseIE)._TIMESTAMP_KEY as keyof typeof video]) ??
        undefined,
      subtitles: this._extractMlbSubtitles(feed, language),
    };
  }

  protected _getFeed(video: Record<string, unknown>): Record<string, unknown> {
    return video;
  }

  protected _extractMlbSubtitles(feed: Record<string, unknown>, language: string): Record<string, Subtitle[]> {
    return extractMlbSubtitlesLegacy(feed, language);
  }

  protected async _downloadVideoData(displayId: string): Promise<Record<string, unknown>> {
    return this._download_json(
      `http://content.mlb.com/mlb/item/id/v1/${displayId}/details/web-v1.json`,
      displayId,
    );
  }
}

export class MLBIE extends MLBBaseIE {
  static IE_NAME = 'mlb';
  static _VALID_URL =
    /https?:\/\/(?:[\da-z_-]+\.)*mlb\.com\/(?:(?:[^/]+\/)*video\/[^/]+\/c-|(?:shared\/video\/embed\/(?:embed|m-internal-embed)\.html|(?:[^/]+\/)+(?:play|index)\.jsp)\?.*?\bcontent_id=)(?<id>\d+)/;

  protected _getFeed(video: Record<string, unknown>): Record<string, unknown> {
    return video;
  }
}

export class MLBVideoIE extends MLBBaseIE {
  static IE_NAME = 'mlb:video';
  static _VALID_URL = /https?:\/\/(?:www\.)?mlb\.com\/(?:[^/]+\/)*video\/(?<id>[^/?&#]+)/;
  static _TIMESTAMP_KEY = 'timestamp';

  static suitable(url: string): boolean {
    if (MLBIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  protected _getFeed(video: Record<string, unknown>): Record<string, unknown> {
    const feeds = video.feeds as Array<Record<string, unknown>>;
    return feeds?.[0] || {};
  }

  protected _extractMlbSubtitles(feed: Record<string, unknown>, language: string): Record<string, Subtitle[]> {
    return extractMlbSubtitlesModern(feed, language);
  }

  protected async _downloadVideoData(displayId: string): Promise<Record<string, unknown>> {
    const query = `{ mediaPlayback(ids: "${displayId}") { description feeds(types: CMS) { closedCaptions duration image { cuts { width height src } } playbacks { name url } } id timestamp title } }`;
    const resp = await this._download_json<{ data: { mediaPlayback: Array<Record<string, unknown>> } }>(
      'https://fastball-gateway.mlb.com/graphql',
      displayId,
      undefined,
      { query: { query } },
    );
    return resp.data?.mediaPlayback?.[0] || {};
  }
}

export class MLBTVIE extends InfoExtractor {
  static IE_NAME = 'mlbtv';
  static _VALID_URL = /https?:\/\/(?:www\.)?mlb\.com\/tv\/g(?<id>\d{6})/;
  static _NETRC_MACHINE = 'mlb';

  private _deviceId: string | null = null;
  private _sessionId: string | null = null;
  private _accessToken: string | null = null;

  protected async _real_initialize(): Promise<void> {
    if (!this._accessToken) {
      this.raise_login_required('All videos are only available to registered users', undefined, 'password');
    }
  }

  protected async _callApi(data: Record<string, unknown>, videoId: string, description = 'GraphQL JSON'): Promise<Record<string, unknown>> {
    return this._download_json('https://media-gateway.mlb.com/graphql', videoId, `Downloading ${description}`, {
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-client-name': 'WEB',
        'x-client-version': '7.8.2',
      },
      data: JSON.stringify(data),
    });
  }

  protected async _extractFormatsAndSubtitles(
    broadcast: Record<string, unknown>,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const feed = str_or_none(broadcast.homeAway)?.replace(/^./, (c) => c.toUpperCase());
    const medium = str_or_none(broadcast.type);
    const language = str_or_none(broadcast.language)?.toLowerCase();
    const formatId = join_nonempty(feed, medium, language);

    const response = await this._callApi(
      {
        operationName: 'initPlaybackSession',
        query: `mutation initPlaybackSession($adCapabilities: [AdExperienceType], $mediaId: String!, $deviceId: String!, $sessionId: String!, $quality: PlaybackQuality) { initPlaybackSession(adCapabilities: $adCapabilities, mediaId: $mediaId, deviceId: $deviceId, sessionId: $sessionId, quality: $quality) { playbackSessionId playback { url token expiration cdn } } }`,
        variables: {
          adCapabilities: ['GOOGLE_STANDALONE_AD_PODS'],
          deviceId: this._deviceId,
          mediaId: broadcast.mediaId,
          quality: 'PLACEHOLDER',
          sessionId: this._sessionId,
        },
      },
      videoId,
      `${formatId} broadcast JSON`,
    );

    const playback = traverse_obj(response, ['data', 'initPlaybackSession', 'playback']) as Record<string, unknown>;
    const m3u8Url = url_or_none(playback?.url);
    if (!m3u8Url || !playback?.token) {
      return { formats: [], subtitles: {} };
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, formatId || 'hls');
    for (const fmt of formats) {
      fmt.format_note = join_nonempty(feed, medium) || fmt.format_note;
      fmt.language = language || fmt.language;
      if (fmt.vcodec === 'none' && fmt.language === 'en') fmt.source_preference = 10;
    }
    return { formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const videoId = this._match_id(url);
    const data = await this._download_json<{ dates?: Array<{ games?: Array<Record<string, unknown>> }> }>(
      'https://statsapi.mlb.com/api/v1/schedule',
      videoId,
      undefined,
      { query: { gamePk: videoId, hydrate: 'broadcasts(all),statusFlags' } },
    );

    let metadata: Record<string, unknown> | undefined;
    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        if (String(game.gamePk) === videoId && !game.rescheduleDate) {
          metadata = game;
          break;
        }
      }
      if (metadata) break;
    }

    const broadcasts = ((metadata?.broadcasts as Array<Record<string, unknown>>) || []).filter(
      (b) => b.mediaId && (b.mediaState as Record<string, unknown>)?.mediaStateCode !== 'MEDIA_OFF',
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const broadcast of broadcasts) {
      const res = await this._extractFormatsAndSubtitles(broadcast, videoId);
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    const teams = (metadata?.teams as Record<string, Record<string, Record<string, unknown>>>) || {};
    const away = str_or_none(teams.away?.team?.name);
    const home = str_or_none(teams.home?.team?.name);
    const teamTitle = [away, home].filter(Boolean).join(' @ ');

    return {
      id: videoId,
      title: join_nonempty(str_or_none(metadata?.officialDate), teamTitle, ' - ') || videoId,
      is_live: broadcasts.some(
        (b) => (b.mediaState as Record<string, unknown>)?.mediaStateCode === 'MEDIA_ON',
      ),
      release_timestamp: parseIso8601(metadata?.gameDate) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class MLBArticleIE extends InfoExtractor {
  static IE_NAME = 'mlb:article';
  static _VALID_URL = /https?:\/\/www\.mlb\.com\/news\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const initState = this._search_json<{ apolloCache?: Record<string, unknown> }>(
      /window\.initState\s*=/,
      webpage,
      'window.initState',
      displayId,
    );
    const apollo = initState?.apolloCache || {};
    const rootQuery = (apollo.ROOT_QUERY as Record<string, unknown>) || {};
    const articleKey = Object.keys(rootQuery).find((k) => k.startsWith('getArticle'));
    const content = (articleKey ? rootQuery[articleKey] : null) as Record<string, unknown> | null;

    const parts = ((content?.parts as Array<Record<string, unknown>>) || []).filter(
      (p) => p.__typename === 'Video' || p.type === 'video',
    );

    return playlistFromMatches(
      this,
      parts.map((p) => `https://www.mlb.com/video/${p.slug}`),
      str_or_none(content?.translationId) || displayId,
      {
        title: this._html_search_meta('og:title', webpage) || undefined,
        description: str_or_none(content?.summary) ?? undefined,
        ie: 'mlb:video',
      },
    );
  }
}
