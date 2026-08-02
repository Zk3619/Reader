/**
 * YoutubeTabIE / YoutubePlaylistIE — playlist & channel tab extraction via ytInitialData + Innertube.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import {
  PLAYLIST_ID_RE,
  YT_TAB_URL_PATTERNS,
  buildChannelTabUrl,
  buildPlaylistPageUrl,
  collectVideoRenderers,
  extractPlaylistMetadata,
  extractYtInitialData,
  extractYtcfg,
  findContinuation,
  innertubeContinuation,
  normalizeYoutubeUrl,
  parseYoutubeQuery,
} from './shared';

const TAB_CHANNEL_PATTERNS = [
  YT_TAB_URL_PATTERNS.channelVideos,
  YT_TAB_URL_PATTERNS.handleVideos,
  YT_TAB_URL_PATTERNS.cVideos,
  YT_TAB_URL_PATTERNS.userVideos,
];

function resolveTabTarget(url: string): { fetchUrl: string; itemId: string; kind: 'playlist' | 'channel' } {
  const normalized = normalizeYoutubeUrl(url);
  const { list, v } = parseYoutubeQuery(normalized);

  for (const re of [YT_TAB_URL_PATTERNS.playlist, YT_TAB_URL_PATTERNS.watchWithList]) {
    const m = normalized.match(re);
    if (m?.groups?.list) {
      const listId = m.groups.list;
      return { fetchUrl: buildPlaylistPageUrl(listId), itemId: listId, kind: 'playlist' };
    }
  }

  for (const re of TAB_CHANNEL_PATTERNS) {
    const m = normalized.match(re);
    if (m?.groups?.id) {
      const id = m.groups.id;
      const tab = m.groups.tab || 'videos';
      let fetchUrl: string;
      if (re === YT_TAB_URL_PATTERNS.cVideos) {
        fetchUrl = `https://www.youtube.com/c/${id}/${tab}`;
      } else if (re === YT_TAB_URL_PATTERNS.userVideos) {
        fetchUrl = `https://www.youtube.com/user/${id}/${tab}`;
      } else {
        fetchUrl = buildChannelTabUrl(id, tab);
      }
      return { fetchUrl, itemId: id, kind: 'channel' };
    }
  }

  if (list) {
    return { fetchUrl: buildPlaylistPageUrl(list), itemId: list, kind: 'playlist' };
  }
  if (v && list) {
    return { fetchUrl: buildPlaylistPageUrl(list), itemId: list, kind: 'playlist' };
  }

  throw new ExtractorError('Unable to resolve YouTube tab/playlist URL', { expected: true });
}

abstract class YoutubeTabBaseIE extends InfoExtractor {
  protected _yesPlaylist(playlistId: string | null, videoId: string | null): boolean {
    if (!playlistId || !videoId) return !videoId;
    if (this.params.noplaylist) {
      this.to_screen(`Downloading just the video ${videoId} because of --no-playlist`);
      return false;
    }
    this.to_screen(
      `Downloading playlist ${playlistId} - add --no-playlist to download just the video ${videoId}`,
    );
    return true;
  }

  protected async _collectPlaylistEntries(
    fetchUrl: string,
    itemId: string,
  ): Promise<{ entries: VideoInfo[]; meta: ReturnType<typeof extractPlaylistMetadata> }> {
    const webpage = await this._download_webpage(fetchUrl, itemId, 'Downloading playlist webpage', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!webpage) {
      throw new ExtractorError('Unable to download YouTube playlist webpage', { expected: true });
    }

    const data = extractYtInitialData(webpage);
    if (!data) {
      throw new ExtractorError('Unable to extract ytInitialData from playlist page', { expected: true });
    }

    const ytcfg = extractYtcfg(webpage);
    const meta = extractPlaylistMetadata(data, itemId);
    const seen = new Set<string>();
    const entries: VideoInfo[] = [];

    const pushVideo = (videoId: string, title?: string) => {
      if (!videoId || seen.has(videoId)) return;
      seen.add(videoId);
      entries.push(
        this.url_result(`https://www.youtube.com/watch?v=${videoId}`, 'Youtube', videoId, title || videoId),
      );
    };

    for (const hit of collectVideoRenderers(data)) {
      pushVideo(hit.videoId, hit.title);
    }

    // Inline playlist on watch pages
    const inlinePlaylist = (data.contents as Record<string, unknown> | undefined)?.twoColumnWatchNextResults as
      | Record<string, unknown>
      | undefined;
    const playlistObj = (inlinePlaylist?.playlist as Record<string, unknown> | undefined)?.playlist;
    if (playlistObj) {
      for (const hit of collectVideoRenderers(playlistObj)) {
        pushVideo(hit.videoId, hit.title);
      }
    }

    let continuation = findContinuation(data);
    const seenTokens = new Set<string>();
    let page = 1;
    const maxPages = 200;

    while (continuation && page <= maxPages) {
      if (seenTokens.has(continuation.continuation)) break;
      seenTokens.add(continuation.continuation);

      const response = await innertubeContinuation(
        async (endpoint, body, headers) =>
          this._download_json<Record<string, unknown>>(endpoint, `${itemId} page ${page}`, 'Downloading playlist API JSON', {
            method: 'POST',
            headers,
            data: JSON.stringify(body),
            fatal: false,
          }),
        continuation,
        ytcfg,
      );

      if (!response || !Object.keys(response).length) break;

      for (const hit of collectVideoRenderers(response)) {
        pushVideo(hit.videoId, hit.title);
      }

      continuation = findContinuation(response);
      page++;
    }

    if (!entries.length) {
      throw new ExtractorError('No videos found in YouTube playlist/tab', { expected: true });
    }

    return { entries, meta };
  }
}

export class YoutubeTabIE extends YoutubeTabBaseIE {
  static IE_NAME = 'youtube:tab';
  static IE_DESC = 'YouTube Tabs';
  static _VALID_URL = [
    YT_TAB_URL_PATTERNS.playlist,
    YT_TAB_URL_PATTERNS.watchWithList,
    YT_TAB_URL_PATTERNS.channelVideos,
    YT_TAB_URL_PATTERNS.handleVideos,
    YT_TAB_URL_PATTERNS.cVideos,
    YT_TAB_URL_PATTERNS.userVideos,
  ];

  static suitable(url: string): boolean {
    const normalized = normalizeYoutubeUrl(url);
    const patterns = [
      YT_TAB_URL_PATTERNS.playlist,
      YT_TAB_URL_PATTERNS.watchWithList,
      YT_TAB_URL_PATTERNS.channelVideos,
      YT_TAB_URL_PATTERNS.handleVideos,
      YT_TAB_URL_PATTERNS.cVideos,
      YT_TAB_URL_PATTERNS.userVideos,
    ];
    if (!patterns.some((re) => re.test(normalized))) return false;
    // Do not steal pure /watch?v= without list=
    try {
      const u = new URL(normalized);
      if (/\/watch\b/i.test(u.pathname) && !u.searchParams.get('list')) return false;
    } catch {
      if (/\/watch(?:\?|$)/i.test(normalized) && !/[?&]list=/.test(normalized)) return false;
    }
    return true;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const normalized = normalizeYoutubeUrl(url);
    const { v: videoId, list: listId } = parseYoutubeQuery(normalized);

    if (videoId && listId && !this._yesPlaylist(listId, videoId)) {
      return this.url_result(`https://www.youtube.com/watch?v=${videoId}`, 'Youtube', videoId);
    }

    if (!videoId && /\/watch\b/i.test(normalized) && listId) {
      this.report_warning(`A video URL was given without video ID. Trying to download playlist ${listId}`);
    }

    const { fetchUrl, itemId } = resolveTabTarget(normalized);
    const { entries, meta } = await this._collectPlaylistEntries(fetchUrl, itemId);

    const playlist = this.playlist_result(entries, meta.id, meta.title, meta.description);
    return {
      ...playlist,
      channel: meta.channel,
      channel_id: meta.channel_id,
      channel_url: meta.channel_url,
      uploader: meta.uploader,
      webpage_url: fetchUrl,
      original_url: url,
      extractor: YoutubeTabIE.IE_NAME,
      extractor_key: 'YoutubeTab',
    };
  }
}

export class YoutubePlaylistIE extends InfoExtractor {
  static IE_NAME = 'youtube:playlist';
  static IE_DESC = 'YouTube playlists';
  static _VALID_URL = new RegExp(
    String.raw`(?:https?:)?//(?:\w+\.)?(?:youtube\.com.*?[?&]list=)?(?<id>${PLAYLIST_ID_RE})(?:[/?#&]|$)|^(?<id2>${PLAYLIST_ID_RE})$`,
    'i',
  );

  static suitable(url: string): boolean {
    if (YoutubeTabIE.suitable(url)) return false;
    const { v } = parseYoutubeQuery(normalizeYoutubeUrl(url));
    if (v) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url.trim());
    const playlistId = m?.groups?.id || m?.groups?.id2;
    if (!playlistId) {
      throw new ExtractorError('Unable to extract YouTube playlist id', { expected: true });
    }

    const playlistUrl = buildPlaylistPageUrl(playlistId);
    return this.url_result(playlistUrl, 'YoutubeTab', playlistId);
  }
}
