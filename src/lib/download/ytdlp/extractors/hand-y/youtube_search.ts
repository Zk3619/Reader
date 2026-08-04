// @ts-nocheck
/**
 * YouTube search IEs â€?ported from yt-dlp youtube/_search.py
 * Pragmatic Innertube search; full TabBase parity not required.
 */

import { InfoExtractor, SearchInfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs } from '../../utils';
import {
  collectVideoRenderers,
  extractYtcfg,
  findContinuation,
  getText,
} from '../youtube/shared';

const DEFAULT_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const DEFAULT_CLIENT_VERSION = '2.20240101.00.00';

type SearchClient = 'web' | 'web_music';

function clientContext(client: SearchClient): Record<string, unknown> {
  if (client === 'web_music') {
    return {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.00.00',
        hl: 'en',
        gl: 'US',
      },
    };
  }
  return {
    client: {
      clientName: 'WEB',
      clientVersion: DEFAULT_CLIENT_VERSION,
      hl: 'en',
      gl: 'US',
    },
  };
}

function collectNonVideoSearchEntries(data: unknown): VideoInfo[] {
  const out: VideoInfo[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const channel = obj.channelRenderer as Record<string, unknown> | undefined;
    if (channel) {
      const channelId = String(channel.channelId || '');
      if (channelId) {
        out.push({
          _type: 'url',
          id: channelId,
          title: getText(channel, 'title') || channelId,
          url: `https://www.youtube.com/channel/${channelId}`,
          ie_key: 'YoutubeTab',
          extractor: 'YoutubeTab',
          extractor_key: 'YoutubeTab',
          channel_id: channelId,
          channel: getText(channel, 'title') || undefined,
        });
      }
    }
    const playlist = obj.playlistRenderer as Record<string, unknown> | undefined;
    if (playlist) {
      const playlistId = String(playlist.playlistId || '');
      if (playlistId) {
        out.push({
          _type: 'url',
          id: playlistId,
          title: getText(playlist, 'title') || playlistId,
          url: `https://www.youtube.com/playlist?list=${playlistId}`,
          ie_key: 'YoutubeTab',
          extractor: 'YoutubeTab',
          extractor_key: 'YoutubeTab',
        });
      }
    }
    for (const val of Object.values(obj)) visit(val);
  };
  visit(data);
  return out;
}

async function* youtubeSearchResults(
  ie: InfoExtractor,
  query: string,
  params: string | null = null,
  defaultClient: SearchClient = 'web',
): AsyncGenerator<VideoInfo> {
  const home =
    defaultClient === 'web_music' ? 'https://music.youtube.com/' : 'https://www.youtube.com/';
  const webpage = await ie._download_webpage(
    home,
    `query "${query}"`,
    'Downloading YouTube homepage',
    {
      fatal: false,
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    },
  );
  const ytcfg = webpage ? extractYtcfg(webpage) : {};
  const apiKey = String(ytcfg.INNERTUBE_API_KEY || DEFAULT_API_KEY);
  const context =
    (ytcfg.INNERTUBE_CONTEXT as Record<string, unknown>) || clientContext(defaultClient);
  const clientVersion = String(
    ((context.client as Record<string, unknown> | undefined)?.clientVersion as string) ||
      ytcfg.INNERTUBE_CLIENT_VERSION ||
      DEFAULT_CLIENT_VERSION,
  );
  const clientName = String(
    ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME || (defaultClient === 'web_music' ? '67' : '1'),
  );

  const endpoint = `${home.replace(/\/$/, '')}/youtubei/v1/search?key=${apiKey}&prettyPrint=false`;
  const seen = new Set<string>();
  let continuation: string | null = null;
  let clickTrackingParams: string | undefined;

  for (let page = 1; page <= 25; page++) {
    const body: Record<string, unknown> = { context };
    if (continuation) {
      body.continuation = continuation;
      if (clickTrackingParams) body.clickTracking = { clickTrackingParams };
    } else {
      body.query = query;
      if (params) body.params = params;
    }

    const response = await ie._download_json<Record<string, unknown>>(
      endpoint,
      `query "${query}" page ${page}`,
      'Downloading search API JSON',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': clientName,
          'X-YouTube-Client-Version': clientVersion,
          Origin: home.replace(/\/$/, ''),
        },
        data: JSON.stringify(body),
        fatal: false,
      },
    );

    if (!response || typeof response !== 'object' || !Object.keys(response).length) break;

    let yielded = 0;
    for (const hit of collectVideoRenderers(response)) {
      if (!hit.videoId || seen.has(hit.videoId)) continue;
      seen.add(hit.videoId);
      yielded++;
      yield ie.url_result(
        `https://www.youtube.com/watch?v=${hit.videoId}`,
        'Youtube',
        hit.videoId,
        hit.title || hit.videoId,
      );
    }

    for (const entry of collectNonVideoSearchEntries(response)) {
      const key = String(entry.id || entry.url || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      yielded++;
      yield entry;
    }

    const cont = findContinuation(response);
    if (!cont || !yielded) break;
    continuation = cont.continuation;
    clickTrackingParams = cont.clickTrackingParams;
  }
}

export class YoutubeSearchIE extends SearchInfoExtractor {
  static IE_DESC = 'YouTube search';
  static IE_NAME = 'youtube:search';
  static _SEARCH_KEY = 'ytsearch';
  static _SEARCH_PARAMS = 'EgIQAfABAQ=='; // Videos only
  static _VALID_URL = /ytsearch(?<prefix>|[1-9][0-9]*|all):(?<query>[\s\S]+)/;
  static _MAX_RESULTS = 1000;

  async _real_extract(query: string): Promise<VideoInfo> {
    const m = this._match_valid_url(query);
    const prefix = m?.groups?.prefix ?? '';
    const q =
      m?.groups?.query ??
      (query.includes(':') ? query.split(':').slice(1).join(':') : query);
    let n = 1;
    if (prefix === 'all') n = YoutubeSearchIE._MAX_RESULTS;
    else if (prefix) n = Math.min(parseInt(prefix, 10) || 1, YoutubeSearchIE._MAX_RESULTS);
    const entries = await this._get_n_results(q, n);
    return this.playlist_result(entries, q, q);
  }

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    for await (const e of youtubeSearchResults(this, query, YoutubeSearchIE._SEARCH_PARAMS)) {
      entries.push(e);
      if (entries.length >= n) break;
    }
    return entries;
  }
}

export class YoutubeSearchURLIE extends InfoExtractor {
  static IE_DESC = 'YouTube search URLs with sorting and filter support';
  static IE_NAME = 'youtube:search_url';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?youtube\.com\/(?:results|search)\?([^#]+&)?(?:search_query|q)=(?:[^&]+)(?:[&#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const query = (qs.search_query || qs.q)?.[0];
    if (!query) {
      return this.playlist_result([], 'search', 'search');
    }
    const sp = qs.sp?.[0] ?? null;
    const entries: VideoInfo[] = [];
    for await (const e of youtubeSearchResults(this, query, sp)) entries.push(e);
    return this.playlist_result(entries, query, query);
  }
}

export class YoutubeMusicSearchURLIE extends InfoExtractor {
  static IE_DESC = 'YouTube music search URLs with selectable sections, e.g. #songs';
  static IE_NAME = 'youtube:music:search_url';
  static _VALID_URL =
    /https?:\/\/music\.youtube\.com\/search\?([^#]+&)?(?:search_query|q)=(?:[^&]+)(?:[&#]|$)/;

  static _SECTIONS: Record<string, string> = {
    albums: 'EgWKAQIYAWoKEAoQAxAEEAkQBQ==',
    artists: 'EgWKAQIgAWoKEAoQAxAEEAkQBQ==',
    'community playlists': 'EgeKAQQoAEABagoQChADEAQQCRAF',
    'featured playlists': 'EgeKAQQoADgBagwQAxAJEAQQDhAKEAU==',
    songs: 'EgWKAQIIAWoKEAoQAxAEEAkQBQ==',
    videos: 'EgWKAQIQAWoKEAoQAxAEEAkQBQ==',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url);
    const query = (qs.search_query || qs.q)?.[0];
    if (!query) {
      return this.playlist_result([], 'search', 'search');
    }
    let params: string | null = qs.sp?.[0] ?? null;
    let section: string | null | undefined;
    if (params) {
      section =
        Object.entries(YoutubeMusicSearchURLIE._SECTIONS).find(([, v]) => v === params)?.[0] ||
        params;
    } else {
      const hash = decodeURIComponent((url.split('#')[1] || '').replace(/\+/g, ' ')).toLowerCase();
      section = hash || null;
      const sectionKey = section || '';
      params = sectionKey ? YoutubeMusicSearchURLIE._SECTIONS[sectionKey] || null : null;
      if (!params) section = null;
    }
    const title = [query, section].filter((x) => typeof x === 'string' && x.length).join(' - ');
    const entries: VideoInfo[] = [];
    for await (const e of youtubeSearchResults(this, query, params, 'web_music')) entries.push(e);
    return this.playlist_result(entries, title, title);
  }
}
