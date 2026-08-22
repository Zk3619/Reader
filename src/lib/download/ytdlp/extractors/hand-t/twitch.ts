/**
 * TwitchBaseIE / TwitchPlaylistBaseIE / TwitchVideos* — ported from yt-dlp twitch.py
 * Skips: TwitchVodIE, TwitchStreamIE, TwitchClipsIE, TwitchCollectionIE, TwitchVideosIE (handwritten)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, parse_qs, unified_timestamp, url_or_none } from '../../utils';

const TWITCH_CLIENT_ID = 'ue6666qo983tsx6so1t0vnawi233wa';

const OPERATION_HASHES: Record<string, string> = {
  ClipsCards__User: '1cd671bfa12cec480499c087319f26d21925e9695d1f80225aae6a4354f23088',
  ChannelCollectionsContent: '5247910a19b1cd2b760939bf4cba4dcbd3d13bdf8c266decd16956f6ef814077',
  FilterableVideoTower_Videos: '67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f',
};

function makeVideoResult(node: Record<string, unknown>): VideoInfo | null {
  const videoId = node.id;
  if (!videoId) return null;
  return {
    _type: 'url_transparent',
    ie_key: 'TwitchVod',
    id: `v${videoId}`,
    url: `https://www.twitch.tv/videos/${videoId}`,
    title: node.title != null ? String(node.title) : undefined,
    thumbnail: node.previewThumbnailURL != null ? String(node.previewThumbnailURL) : undefined,
    duration: float_or_none(node.lengthSeconds) ?? undefined,
    view_count: int_or_none(node.viewCount) ?? undefined,
  };
}

export class TwitchBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;

  protected _CLIENT_ID = TWITCH_CLIENT_ID;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TwitchBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _downloadGql<T>(
    videoId: string,
    ops: Array<{ operationName: string; variables: Record<string, unknown> }>,
    note: string,
    fatal = true,
  ): Promise<T | null> {
    const payload = ops.map((op) => ({
      ...op,
      extensions: { persistedQuery: { version: 1, sha256Hash: OPERATION_HASHES[op.operationName] } },
    }));
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Client-ID': this._CLIENT_ID,
    };
    try {
      const cookies = this._get_cookies('https://gql.twitch.tv');
      const auth = cookies['auth-token'] || cookies['auth_token'];
      if (auth) headers.Authorization = `OAuth ${auth}`;
    } catch {
      /* ignore */
    }
    return this._download_json<T>('https://gql.twitch.tv/gql', videoId, note, {
      method: 'POST',
      headers,
      data: JSON.stringify(payload),
      fatal,
    });
  }
}

export class TwitchPlaylistBaseIE extends TwitchBaseIE {
  protected static _PAGE_LIMIT = 100;
  protected static _OPERATION_NAME = '';
  protected static _ENTRY_KIND = '';
  protected static _EDGE_KIND = '';
  protected static _NODE_KIND = '';

  protected static _makeVariables(_channelName: string, ..._args: unknown[]): Record<string, unknown> {
    return {};
  }

  protected static _extractEntry(_node: Record<string, unknown>): VideoInfo | null {
    return null;
  }

  protected async *_entries(channelName: string, ...args: unknown[]): AsyncGenerator<VideoInfo> {
    const ctor = this.constructor as typeof TwitchPlaylistBaseIE;
    let cursor: string | undefined;
    const variablesCommon = ctor._makeVariables(channelName, ...args);
    const entriesKey = `${ctor._ENTRY_KIND}s`;

    for (let pageNum = 1; ; pageNum++) {
      const variables = { ...variablesCommon, limit: ctor._PAGE_LIMIT, ...(cursor ? { cursor } : {}) };
      const page = await this._downloadGql<Array<{ data?: { user?: Record<string, unknown> } }>>(
        channelName,
        [{ operationName: ctor._OPERATION_NAME, variables }],
        `Downloading ${ctor._NODE_KIND}s GraphQL page ${pageNum}`,
        false,
      );
      const userId = (page?.[0]?.data?.user as Record<string, unknown> | undefined)?.id;
      if (userId === '') throw new ExtractorError(`Channel "${channelName}" not found`, { expected: true });
      if (!page) break;

      const edges = (page[0]?.data?.user as Record<string, Record<string, unknown[]>> | undefined)?.[entriesKey]?.edges;
      if (!Array.isArray(edges) || !edges.length) break;

      for (const edge of edges) {
        if (!edge || typeof edge !== 'object') continue;
        const e = edge as Record<string, unknown>;
        if (e.__typename !== ctor._EDGE_KIND) continue;
        const node = e.node;
        if (!node || typeof node !== 'object' || (node as Record<string, unknown>).__typename !== ctor._NODE_KIND) {
          continue;
        }
        const entry = ctor._extractEntry(node as Record<string, unknown>);
        if (entry) {
          cursor = e.cursor != null ? String(e.cursor) : undefined;
          yield entry;
        }
      }
      if (!cursor) break;
    }
  }
}

export class TwitchVideosBaseIE extends TwitchPlaylistBaseIE {
  protected static _OPERATION_NAME = 'FilterableVideoTower_Videos';
  protected static _ENTRY_KIND = 'video';
  protected static _EDGE_KIND = 'VideoEdge';
  protected static _NODE_KIND = 'Video';

  protected static _makeVariables(channelName: string, broadcastType: unknown, sort: unknown) {
    return {
      channelOwnerLogin: channelName,
      broadcastType,
      videoSort: String(sort || 'time').toUpperCase(),
    };
  }

  protected static _extractEntry(node: Record<string, unknown>) {
    return makeVideoResult(node);
  }
}

export class TwitchVideosClipsIE extends TwitchPlaylistBaseIE {
  static IE_NAME = 'twitch:videos:clips';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|go|m)\.)?twitch\.tv\/(?<id>[^/]+)\/(?:clips|videos\/?(?:\?.*?&)?filter=clips)/;

  protected static _PAGE_LIMIT = 20;
  protected static _OPERATION_NAME = 'ClipsCards__User';
  protected static _ENTRY_KIND = 'clip';
  protected static _EDGE_KIND = 'ClipEdge';
  protected static _NODE_KIND = 'Clip';

  protected static _makeVariables(channelName: string, channelFilter: unknown) {
    return { login: channelName, criteria: { filter: channelFilter } };
  }

  protected static _extractEntry(node: Record<string, unknown>): VideoInfo | null {
    const clipUrl = url_or_none(node.url);
    if (!clipUrl) return null;
    return {
      _type: 'url_transparent',
      ie_key: 'TwitchClips',
      id: node.id != null ? String(node.id) : clipUrl,
      url: clipUrl,
      title: node.title != null ? String(node.title) : undefined,
      thumbnail: node.thumbnailURL != null ? String(node.thumbnailURL) : undefined,
      duration: float_or_none(node.durationSeconds) ?? undefined,
      timestamp: unified_timestamp(node.createdAt) ?? undefined,
      view_count: int_or_none(node.viewCount) ?? undefined,
      language: node.language != null ? String(node.language) : undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelName = this._match_id(url);
    const qs = parse_qs(new URL(url).search);
    const dateRange = qs.range?.[0] || '7d';
    const rangeMap: Record<string, [string, string]> = {
      '24hr': ['LAST_DAY', 'Top 24H'],
      '7d': ['LAST_WEEK', 'Top 7D'],
      '30d': ['LAST_MONTH', 'Top 30D'],
      all: ['ALL_TIME', 'Top All'],
    };
    const [filter, label] = rangeMap[dateRange] || rangeMap['7d']!;
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(channelName, filter)) entries.push(entry);
    return this.playlist_result(entries, channelName, `${channelName} - Clips ${label}`);
  }
}

export class TwitchVideosCollectionsIE extends TwitchPlaylistBaseIE {
  static IE_NAME = 'twitch:videos:collections';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|go|m)\.)?twitch\.tv\/(?<id>[^/]+)\/videos\/?(?:\?.*?&)?filter=collections/;

  protected static _OPERATION_NAME = 'ChannelCollectionsContent';
  protected static _ENTRY_KIND = 'collection';
  protected static _EDGE_KIND = 'CollectionsItemEdge';
  protected static _NODE_KIND = 'Collection';

  protected static _makeVariables(channelName: string) {
    return { ownerLogin: channelName };
  }

  protected static _extractEntry(node: Record<string, unknown>): VideoInfo | null {
    const collectionId = node.id;
    if (!collectionId) return null;
    return {
      _type: 'url_transparent',
      ie_key: 'TwitchCollection',
      id: String(collectionId),
      url: `https://www.twitch.tv/collections/${collectionId}`,
      title: node.title != null ? String(node.title) : undefined,
      thumbnail: node.thumbnailURL != null ? String(node.thumbnailURL) : undefined,
      duration: float_or_none(node.lengthSeconds) ?? undefined,
      timestamp: unified_timestamp(node.updatedAt) ?? undefined,
      view_count: int_or_none(node.viewCount) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelName = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(channelName)) entries.push(entry);
    return this.playlist_result(entries, channelName, `${channelName} - Collections`);
  }
}
