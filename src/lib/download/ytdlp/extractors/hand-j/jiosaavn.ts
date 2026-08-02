/**
 * JioSaavnBaseIE / JioSaavnSongIE / JioSaavnAlbumIE / JioSaavnArtistIE /
 * JioSaavnPlaylistIE / JioSaavnShowIE / JioSaavnShowPlaylistIE — ported from yt-dlp jiosaavn.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  js_to_json,
  smuggle_url,
  str_or_none,
  traverse_obj,
  unified_strdate,
  unified_timestamp,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { url_basename, urlencodePostdata, urljoin } from './_helpers';

const URL_BASE_RE = /https?:\/\/(?:www\.)?(?:jio)?saavn\.com/;
const API_URL = 'https://www.jiosaavn.com/api.php';
const VALID_BITRATES = new Set(['16', '32', '64', '128', '320']);
const DEFAULT_BITRATES = ['128', '320'];

export class JioSaavnBaseIE extends InfoExtractor {
  static IE_NAME = 'jiosaavnbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('JioSaavnBaseIE is not a standalone extractor', { expected: true });
  }

  protected get requestedBitrates(): string[] {
    return DEFAULT_BITRATES;
  }

  protected async *_extractFormats(itemData: Record<string, unknown>): AsyncGenerator<Format> {
    let encryptedUrl = str_or_none(traverse_obj(itemData, ['more_info', 'encrypted_media_url']));
    if (encryptedUrl && !itemData.encrypted_media_url) {
      itemData.encrypted_media_url = encryptedUrl;
    }
    encryptedUrl = str_or_none(itemData.encrypted_media_url);
    const itemId = str_or_none(itemData.id) || 'unknown';

    if (!encryptedUrl) return;

    for (const bitrate of this.requestedBitrates) {
      if (!VALID_BITRATES.has(bitrate)) continue;
      const mediaData = await this._download_json<Record<string, unknown>>(
        API_URL,
        itemId,
        `Downloading format info for ${bitrate}`,
        {
          fatal: false,
          data: urlencodePostdata({
            __call: 'song.generateAuthToken',
            _format: 'json',
            bitrate,
            url: encryptedUrl,
          }),
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      const authUrl = url_or_none(mediaData?.auth_url);
      if (!authUrl) {
        this.report_warning(`Unable to extract format info for ${bitrate}`);
        continue;
      }
      const mediaType = str_or_none(mediaData?.type);
      yield {
        url: authUrl,
        ext: mediaType === 'mp4' ? 'm4a' : mediaType || 'm4a',
        format_id: bitrate,
        abr: Number(bitrate),
        vcodec: 'none',
      };
    }
  }

  protected async _callApi(
    type: string,
    token: string,
    note = 'API',
    params: Record<string, string | number> = {},
  ): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(API_URL, token, `Downloading ${note} JSON`, {
        query: {
          __call: 'webapi.get',
          _format: 'json',
          _marker: '0',
          ctx: 'web6dot0',
          token,
          type,
          ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        },
      })) || {}
    );
  }

  protected static _extractSong(songData: Record<string, unknown>, pageUrl?: string): Partial<VideoInfo> {
    const moreInfo = (songData.more_info as Record<string, unknown>) || {};
    const info: Partial<VideoInfo> = {
      id: str_or_none(songData.id) ?? undefined,
      title: clean_html(str_or_none(songData.song) || str_or_none(songData.title)) ?? undefined,
      album: clean_html(str_or_none(songData.album) || str_or_none(moreInfo.album)) ?? undefined,
      duration: int_or_none(songData.duration ?? moreInfo.duration) ?? undefined,
      channel: str_or_none(moreInfo.label) ?? undefined,
      channel_id: str_or_none(moreInfo.label_id) ?? undefined,
      channel_url: url_or_none(moreInfo.label_url)
        ? urljoin('https://www.jiosaavn.com/', String(moreInfo.label_url))
        : undefined,
      release_date: unified_strdate(moreInfo.release_date) ?? undefined,
      release_year: int_or_none(songData.year) ?? undefined,
      view_count: int_or_none(songData.play_count) ?? undefined,
      language: str_or_none(songData.language) ?? undefined,
      webpage_url: url_or_none(songData.perma_url) ?? undefined,
    };

    const thumb = url_or_none(songData.image);
    if (thumb) {
      info.thumbnail = thumb.replace(/-\d+x\d+\./, '-500x500.');
    }

    const artists: string[] = [];
    const artistMap = (moreInfo.artistMap as Record<string, unknown>) || {};
    for (const a of (artistMap.primary_artists as Array<Record<string, unknown>>) || []) {
      const name = str_or_none(a?.name);
      if (name) artists.push(name);
    }
    const primary = str_or_none(songData.primary_artists);
    if (primary) artists.push(...primary.split(', '));
    const featured = str_or_none(songData.featured_artists);
    if (featured) artists.push(...featured.split(', '));
    if (artists.length) info.artists = [...new Set(artists)];

    const webpageUrl = info.webpage_url || pageUrl;
    if (webpageUrl) info.display_id = url_basename(webpageUrl);

    return info;
  }

  protected static _extractEpisode(episodeData: Record<string, unknown>, pageUrl?: string): Partial<VideoInfo> {
    const info = JioSaavnBaseIE._extractSong(episodeData, pageUrl);
    const moreInfo = (episodeData.more_info as Record<string, unknown>) || {};
    return {
      ...info,
      description: str_or_none(moreInfo.description) ?? undefined,
      timestamp: unified_timestamp(moreInfo.release_time) ?? undefined,
      series: str_or_none(moreInfo.show_title) ?? undefined,
      series_id: str_or_none(moreInfo.show_id) ?? undefined,
      season: str_or_none(moreInfo.season_title) ?? undefined,
      season_number: int_or_none(moreInfo.season_no) ?? undefined,
      season_id: str_or_none(moreInfo.season_id) ?? undefined,
      episode_number: int_or_none(moreInfo.episode_number) ?? undefined,
      cast: str_or_none(episodeData.starring)?.split(', '),
    };
  }

  protected async _extractJiosaavnResult(
    url: string,
    endpoint: string,
    responseKey: string,
    parseFunc: (data: Record<string, unknown>, pageUrl?: string) => Partial<VideoInfo>,
  ): Promise<VideoInfo> {
    const [realUrl, smuggled] = unsmuggle_url(url, {});
    let data: Record<string, unknown> = {
      id: str_or_none(smuggled.id),
      encrypted_media_url: str_or_none(smuggled.encrypted_media_url),
    };

    let result: Partial<VideoInfo>;
    if (data.id && data.encrypted_media_url) {
      result = { id: data.id as string };
    } else {
      const api = await this._callApi(endpoint, this._match_id(realUrl));
      const rows = (api[responseKey] as Record<string, unknown>[]) || [];
      data = rows[0] || {};
      result = parseFunc(data, realUrl);
    }

    const formats: Format[] = [];
    for await (const fmt of this._extractFormats(data)) {
      formats.push(fmt);
    }

    return { ...result, formats } as VideoInfo;
  }

  protected *_yieldItems(
    playlistData: Record<string, unknown>,
    keys: string | string[] | null,
    parseFunc: (data: Record<string, unknown>) => Partial<VideoInfo>,
    entryIe: string,
  ): Generator<VideoInfo> {
    let items: unknown;
    if (keys == null) {
      items = Array.isArray(playlistData)
        ? playlistData
        : (playlistData as Record<string, unknown>).episodes ?? Object.values(playlistData);
    } else {
      const keyList = Array.isArray(keys) ? keys : [keys];
      items = playlistData;
      for (const key of keyList) {
        items = (items as Record<string, unknown>)?.[key];
      }
    }
    if (!Array.isArray(items)) items = [];

    for (const item of items as Record<string, unknown>[]) {
      if (!item?.id || !item?.perma_url) continue;
      const info = parseFunc(item);
      const smug = smuggle_url(String(item.perma_url), {
        id: String(item.id),
        encrypted_media_url: str_or_none(item.encrypted_media_url) || str_or_none((item.more_info as Record<string, unknown>)?.encrypted_media_url),
      });
      yield {
        _type: 'url_transparent',
        ...info,
        url: smug,
        extractor: entryIe,
        extractor_key: entryIe,
        id: str_or_none(item.id) || undefined,
      } as VideoInfo;
    }
  }
}

export class JioSaavnSongIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:song';
  static _VALID_URL = new RegExp(
    `${URL_BASE_RE.source}(?:/song/[^/?#]+/|/s/song/(?:[^/?#]+/){3})(?<id>[^/?#]+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractJiosaavnResult(url, 'song', 'songs', JioSaavnBaseIE._extractSong);
  }
}

export class JioSaavnShowIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:show';
  static _VALID_URL = new RegExp(`${URL_BASE_RE.source}/shows/[^/?#]+/(?<id>[^/?#]{11,})/?(?:$|[?#])`);

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractJiosaavnResult(url, 'episode', 'episodes', JioSaavnBaseIE._extractEpisode);
  }
}

export class JioSaavnAlbumIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:album';
  static _VALID_URL = new RegExp(`${URL_BASE_RE.source}/album/[^/?#]+/(?<id>[^/?#]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const albumData = await this._callApi('album', displayId);
    const entries = [...this._yieldItems(albumData, 'songs', JioSaavnBaseIE._extractSong, 'JioSaavnSong')];
    return this.playlist_result(entries, displayId, str_or_none(albumData.title) ?? undefined);
  }
}

export class JioSaavnPlaylistIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:playlist';
  static _VALID_URL = new RegExp(
    `${URL_BASE_RE.source}(?:/s/playlist/(?:[^/?#]+/){2}|/featured/[^/?#]+/)(?<id>[^/?#]+)`,
  );
  static PAGE_SIZE = 50;

  protected async _fetchPage(token: string, page: number): Promise<Record<string, unknown>> {
    return this._callApi('playlist', token, `playlist page ${page}`, { p: page, n: JioSaavnPlaylistIE.PAGE_SIZE });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const firstPage = await this._fetchPage(displayId, 1);
    const listCount = int_or_none(firstPage.list_count) ?? 0;
    const totalPages = Math.ceil(listCount / JioSaavnPlaylistIE.PAGE_SIZE);

    const entries: VideoInfo[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const pageData = page === 1 ? firstPage : await this._fetchPage(displayId, page);
      entries.push(...this._yieldItems(pageData, 'songs', JioSaavnBaseIE._extractSong, 'JioSaavnSong'));
    }

    return this.playlist_result(entries, displayId, str_or_none(firstPage.listname) ?? undefined);
  }
}

export class JioSaavnShowPlaylistIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:show:playlist';
  static _VALID_URL = new RegExp(`${URL_BASE_RE.source}/shows/(?<show>[^#/?]+)/(?<season>\\d+)/[^/?#]+`);
  static PAGE_SIZE = 10;

  protected async _fetchPage(showId: string, seasonId: string, page: number): Promise<Record<string, unknown>> {
    return this._callApi('show', showId, `show page ${page}`, {
      p: page,
      __call: 'show.getAllEpisodes',
      show_id: showId,
      season_number: seasonId,
      api_version: '4',
      sort_order: 'desc',
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const showSlug = m.groups?.show ?? '';
    const seasonId = m.groups?.season ?? '';
    const playlistId = `${showSlug}-${seasonId}`;

    const webpage = await this._download_webpage(url, playlistId);
    const initialData = this._search_json<{ showView?: Record<string, unknown> }>(
      /window\.__INITIAL_DATA__\s*=/,
      webpage,
      'initial data',
      playlistId,
      { transform_source: js_to_json },
    );
    const showInfo = (initialData?.showView as Record<string, unknown>) || {};
    const showId = String(showInfo.current_id ?? '');

    const entries: VideoInfo[] = [];
    for (let page = 1; ; page++) {
      const pageData = await this._fetchPage(showId, seasonId, page);
      const batch = [...this._yieldItems(pageData, null, JioSaavnBaseIE._extractEpisode, 'JioSaavnShow')];
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < JioSaavnShowPlaylistIE.PAGE_SIZE) break;
    }

    const showTitle = str_or_none(traverse_obj(showInfo, ['show', 'title', 'text'])) ?? undefined;
    return this.playlist_result(entries, playlistId, showTitle);
  }
}

export class JioSaavnArtistIE extends JioSaavnBaseIE {
  static IE_NAME = 'jiosaavn:artist';
  static _VALID_URL = new RegExp(`${URL_BASE_RE.source}/artist/[^/?#]+/(?<id>[^/?#]+)`);
  static PAGE_SIZE = 50;

  protected async _fetchPage(artistId: string, page: number): Promise<Record<string, unknown>> {
    return this._callApi('artist', artistId, `artist page ${page + 1}`, {
      p: page,
      n_song: JioSaavnArtistIE.PAGE_SIZE,
      n_album: JioSaavnArtistIE.PAGE_SIZE,
      sub_type: '',
      includeMetaTags: '',
      api_version: '4',
      category: 'alphabetical',
      sort_order: 'asc',
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const artistId = this._match_id(url);
    const entries: VideoInfo[] = [];
    let artistName: string | undefined;

    for (let page = 0; ; page++) {
      const playlistData = await this._fetchPage(artistId, page);
      if (page === 0) artistName = str_or_none(playlistData.name) ?? undefined;
      const topSongs = (playlistData.topSongs as unknown[]) || [];
      if (!topSongs.some((s) => s && typeof s === 'object')) break;
      const batch = [...this._yieldItems(playlistData, 'topSongs', JioSaavnBaseIE._extractSong, 'JioSaavnSong')];
      entries.push(...batch);
      if (batch.length < JioSaavnArtistIE.PAGE_SIZE) break;
    }

    return this.playlist_result(entries, artistId, artistName);
  }
}
