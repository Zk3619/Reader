/** Soundcloud* IE siblings — ported from yt-dlp soundcloud.py (SoundcloudIE skipped — see sites.ts) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  join_nonempty,
  mimetype2ext,
  parse_qs,
  str_or_none,
  unified_timestamp,
  update_url_query,
  url_or_none,
  traverse_obj,
} from '../../utils';

const CLIENT_ID_CACHE: { value: string | null } = { value: null };
const DEFAULT_FORMATS = ['http_aac', 'hls_aac', 'http_opus', 'hls_opus', 'http_mp3', 'hls_mp3'];
const IMAGE_REPL_RE = /-[0-9a-z]+\.(jpg|png)/i;
const ARTWORK_MAP: Record<string, number> = {
  mini: 16,
  tiny: 20,
  small: 32,
  badge: 47,
  t67x67: 67,
  large: 100,
  t300x300: 300,
  crop: 400,
  t500x500: 500,
  original: 0,
};

export class SoundcloudEmbedIE extends InfoExtractor {
  static IE_NAME = 'soundcloud:embed';
  static _VALID_URL = /https?:\/\/(?:w|player|p)\.soundcloud\.com\/player\/?.*?\burl=(?<id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = parse_qs(url);
    let apiUrl = query.url?.[0] || '';
    const secret = query.secret_token?.[0];
    if (secret) apiUrl = update_url_query(apiUrl, { secret_token: secret });
    return this.url_result(apiUrl, 'Soundcloud');
  }
}

export class SoundcloudBaseIE extends InfoExtractor {
  static IE_NAME = 'soundcloudbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'soundcloud';
  static _API_V2_BASE = 'https://api-v2.soundcloud.com/';
  static _BASE_URL = 'https://soundcloud.com/';
  static _API_AUTH_QUERY_TEMPLATE = '?client_id=%s';

  protected _CLIENT_ID = '';
  protected _HEADERS: Record<string, string> = {};

  protected _isRequested(formatId: string): boolean {
    const ea = this.params.extractor_args as Record<string, { formats?: string[] }> | undefined;
    const patterns = ea?.soundcloud?.formats || ['default'];
    const expanded = patterns.flatMap((p) => (p === 'default' ? DEFAULT_FORMATS : [p]));
    return expanded.some((p) => new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(formatId));
  }

  protected _storeClientId(clientId: string | null): void {
    CLIENT_ID_CACHE.value = clientId;
  }

  protected async _updateClientId(): Promise<void> {
    const webpage = await this._download_webpage('https://soundcloud.com/', 'sc', 'Downloading main page');
    const scripts = [...webpage.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]!).reverse();
    for (const src of scripts) {
      const script = await this._download_webpage(src, 'sc', 'Downloading JS asset', { fatal: false });
      if (!script) continue;
      const clientId = this._search_regex(/client_id\s*:\s*"([0-9a-zA-Z]{32})"/, script, 'client id', null, false);
      if (clientId) {
        this._CLIENT_ID = clientId;
        this._storeClientId(clientId);
        return;
      }
    }
    throw new ExtractorError('Unable to extract client id');
  }

  protected async _callApi<T = Record<string, unknown>>(
    url: string,
    videoId: string,
    note?: string,
    opts?: { query?: Record<string, string>; headers?: Record<string, string>; fatal?: boolean },
  ): Promise<T | false> {
    const nonFatal = opts?.fatal === false;
    const query = { ...(opts?.query || {}), client_id: this._CLIENT_ID };
    for (let first = true; ; first = false) {
      try {
        return await this._download_json<T>(url, videoId, note, {
          query,
          headers: { ...this._HEADERS, ...(opts?.headers || {}) },
        });
      } catch (e) {
        if (first) {
          await this._updateClientId();
          query.client_id = this._CLIENT_ID;
          continue;
        }
        if (nonFatal) {
          this.report_warning(String(e));
          return false as false;
        }
        throw e;
      }
    }
  }

  protected async _initializePreLogin(): Promise<void> {
    if (this._CLIENT_ID) return;
    this._CLIENT_ID = CLIENT_ID_CACHE.value || '';
    if (!this._CLIENT_ID) await this._updateClientId();
  }

  protected async _realInitialize(): Promise<void> {
    if (Object.keys(this._HEADERS).length) return;
    const token = this._get_cookies(SoundcloudBaseIE._BASE_URL)['oauth_token'];
    if (token) this._HEADERS.Authorization = `OAuth ${token}`;
  }

  protected _extractThumbnails(info: Record<string, unknown>): Thumbnail[] | undefined {
    const thumbnailUrl =
      url_or_none(info.artwork_url) || url_or_none(traverse_obj(info, ['user', 'avatar_url']));
    if (!thumbnailUrl) return undefined;
    const mobj = IMAGE_REPL_RE.exec(thumbnailUrl);
    if (!mobj) return [{ url: thumbnailUrl }];
    const thumbnails: Thumbnail[] = [];
    for (const [imageId, size] of Object.entries(ARTWORK_MAP)) {
      const ext = imageId === 'original' ? mobj[1] : 'jpg';
      const thumb: Thumbnail = {
        id: imageId,
        url: thumbnailUrl.replace(IMAGE_REPL_RE, `-${imageId}.${ext}`),
      };
      if (size) {
        thumb.width = size;
        thumb.height = size;
      }
      if (imageId === 'original') thumb.preference = 10;
      thumbnails.push(thumb);
    }
    return thumbnails;
  }

  protected async _extractInfoDict(
    info: Record<string, unknown>,
    _fullTitle?: string,
    secretToken?: string,
    extractFlat = false,
  ): Promise<VideoInfo> {
    const trackId = String(info.id);
    const query: Record<string, string> = { client_id: this._CLIENT_ID };
    if (secretToken) query.secret_token = secretToken;

    const formatUrls = new Set<string>();
    const formats: Format[] = [];

    if (!extractFlat && info.downloadable && info.has_downloads_left) {
      try {
        const downloadData = await this._download_json<{ redirectUri?: string }>(
          `${SoundcloudBaseIE._API_V2_BASE}tracks/${trackId}/download`,
          trackId,
          'Downloading original download format info JSON',
          { query, headers: this._HEADERS, fatal: false },
        );
        const redirect = url_or_none(downloadData?.redirectUri);
        if (redirect) {
          formatUrls.add(redirect);
          formats.push({
            format_id: 'download',
            url: redirect,
            ext: 'mp3',
            quality: 10,
            format_note: 'Original',
            vcodec: 'none',
          });
        }
      } catch {
        /* ignore download errors */
      }
    }

    for (const t of (traverse_obj(info, ['media', 'transcodings']) as Record<string, unknown>[]) || []) {
      if (extractFlat) break;
      const formatUrl = url_or_none(t.url);
      const preset = String(t.preset || '');
      if (!formatUrl || !preset) continue;

      let protocol = String(traverse_obj(t, ['format', 'protocol']) || 'http');
      if (protocol.startsWith('ctr-') || protocol.startsWith('cbc-')) continue;
      if (protocol === 'progressive') protocol = 'http';
      if (protocol !== 'hls' && formatUrl.includes('/hls')) protocol = 'hls';
      if (protocol === 'encrypted-hls' || formatUrl.includes('/encrypted-hls')) protocol = 'hls-aes';

      const shortId = `${protocol}_${preset.split('_')[0]}`;
      if (preset.split('_')[0] === 'abr') continue;
      if (!this._isRequested(shortId)) continue;

      const streamJson = await this._callApi<{ url?: string }>(
        formatUrl,
        trackId,
        `Downloading ${shortId} format info JSON`,
        { query, headers: this._HEADERS },
      );
      const streamUrl = url_or_none((streamJson as Record<string, unknown>)?.url);
      if (!streamUrl || formatUrls.has(streamUrl)) continue;
      formatUrls.add(streamUrl);

      const mimeType = String(traverse_obj(t, ['format', 'mime_type']) || '');
      const codec = this._search_regex(/codecs="([^"]+)"/, mimeType, 'codec', null, false);
      let ext = ({ mp4a: 'm4a', opus: 'opus' } as Record<string, string>)[codec?.slice(0, 4) || ''] ||
        mimetype2ext(mimeType) ||
        preset.split('_')[0];
      if (!ext || ext === 'm3u8') ext = preset.split('_')[0];

      formats.push({
        format_id: join_nonempty(protocol, preset, undefined, '_'),
        url: streamUrl,
        ext,
        acodec: codec || undefined,
        vcodec: 'none',
        protocol: protocol.startsWith('hls') ? 'm3u8_native' : 'http',
      });
    }

    if (!formats.length && info.policy === 'BLOCK') {
      this.raise_geo_restricted(undefined, undefined);
    }

    return {
      id: trackId,
      uploader: traverse_obj(info, ['user', 'username']) as string | undefined,
      uploader_id: str_or_none(traverse_obj(info, ['user', 'id'])) || str_or_none(info.permalink) || undefined,
      uploader_url: url_or_none(traverse_obj(info, ['user', 'permalink_url'])) || undefined,
      timestamp: unified_timestamp(info.created_at) ?? undefined,
      title: String(info.title || trackId),
      track: String(info.title || trackId),
      description: info.description != null ? String(info.description) : undefined,
      duration: float_or_none(info.duration, 1000) ?? undefined,
      webpage_url: url_or_none(info.permalink_url) || undefined,
      license: info.license != null ? String(info.license) : undefined,
      view_count: int_or_none(info.playback_count) ?? undefined,
      like_count: int_or_none(info.favoritings_count ?? info.likes_count) ?? undefined,
      comment_count: int_or_none(info.comment_count) ?? undefined,
      repost_count: int_or_none(info.reposts_count) ?? undefined,
      release_timestamp: unified_timestamp(info.release_date) ?? undefined,
      modified_timestamp: unified_timestamp(info.last_modified) ?? undefined,
      genres: info.genre ? [String(info.genre)] : undefined,
      thumbnails: this._extractThumbnails(info),
      formats: extractFlat ? undefined : formats,
    };
  }

  static _resolvUrl(target: string): string {
    return `${SoundcloudBaseIE._API_V2_BASE}resolve?url=${encodeURIComponent(target)}`;
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('SoundcloudBaseIE is not a standalone extractor', { expected: true });
  }
}

export class SoundcloudPlaylistBaseIE extends SoundcloudBaseIE {
  static IE_NAME = 'soundcloudplaylistbase';

  protected async _extractSet(playlist: Record<string, unknown>, token?: string): Promise<VideoInfo> {
    const playlistId = String(playlist.id);
    let tracks = (playlist.tracks as Record<string, unknown>[]) || [];
    if (!tracks.every((t) => t.permalink_url) && token) {
      tracks =
        ((await this._callApi<Record<string, unknown>[]>(
          `${SoundcloudBaseIE._API_V2_BASE}tracks`,
          playlistId,
          'Downloading tracks',
          {
            query: {
              ids: tracks.map((t) => String(t.id)).join(','),
              playlistId,
              playlistSecretToken: token,
            },
            headers: this._HEADERS,
          },
        )) as Record<string, unknown>[]) || tracks;
    }

    void {
      album: playlist.title != null ? String(playlist.title) : undefined,
      album_artists: traverse_obj(playlist, ['user', 'username'])
        ? [String(traverse_obj(playlist, ['user', 'username']))]
        : undefined,
      album_type: String(playlist.set_type || 'playlist'),
    };

    const entries = tracks
      .map((track) => {
        const trackId = str_or_none(track.id);
        let trackUrl = url_or_none(track.permalink_url);
        if (!trackUrl && trackId) {
          trackUrl = `${SoundcloudBaseIE._API_V2_BASE}tracks/${trackId}${token ? `?secret_token=${token}` : ''}`;
        }
        if (!trackUrl) return null;
        return this.url_result(trackUrl, 'Soundcloud', trackId || undefined, String(track.title || ''));
      })
      .filter(Boolean) as VideoInfo[];

    return this.playlist_result(entries, playlistId, String(playlist.title || playlistId), String(playlist.description || ''));
  }
}

export class SoundcloudSetIE extends SoundcloudPlaylistBaseIE {
  static IE_NAME = 'soundcloud:set';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(?<uploader>[\w\d-]+)\/sets\/(?<slug_title>[:\w\d-]+)(?:\/(?<token>[^?/]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let fullTitle = `${m.groups!.uploader}/sets/${m.groups!.slug_title}`;
    const token = m.groups!.token;
    if (token) fullTitle += `/${token}`;
    const info = (await this._callApi(
      SoundcloudBaseIE._resolvUrl(SoundcloudBaseIE._BASE_URL + fullTitle),
      fullTitle,
      undefined,
      { headers: this._HEADERS },
    )) as Record<string, unknown>;
    if (info.errors) {
      throw new ExtractorError(
        `unable to download video webpage: ${(info.errors as Record<string, unknown>[]).map((e) => e.error_message).join(',')}`,
      );
    }
    return this._extractSet(info, token);
  }
}

export class SoundcloudPagedPlaylistBaseIE extends SoundcloudBaseIE {
  static IE_NAME = 'soundcloudpagedplaylistbase';

  protected async *_entries(baseUrl: string, playlistId: string): AsyncGenerator<VideoInfo> {
    let nextUrl: string | undefined = update_url_query(baseUrl, {
      limit: '200',
      linked_partitioning: '1',
      offset: '0',
    });
    for (let page = 0; nextUrl; page++) {
      const response = (await this._callApi<{ collection?: Record<string, unknown>[]; next_href?: string }>(
        nextUrl,
        playlistId,
        `Downloading track page ${page + 1}`,
        { headers: this._HEADERS },
      )) as { collection?: Record<string, unknown>[]; next_href?: string };
      for (const e of response.collection || []) {
        const cand = (e.track || e.playlist || e) as Record<string, unknown>;
        const permalink = url_or_none(cand.permalink_url);
        if (permalink) {
          yield this.url_result(permalink, 'Soundcloud', str_or_none(cand.id) || undefined, String(cand.title || ''));
        }
      }
      nextUrl = response.next_href;
    }
  }

  protected async _extractPlaylist(baseUrl: string, playlistId: string, playlistTitle: string): Promise<VideoInfo> {
    const entries: VideoInfo[] = [];
    for await (const e of this._entries(baseUrl, playlistId)) entries.push(e);
    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}

export class SoundcloudUserIE extends SoundcloudPagedPlaylistBaseIE {
  static IE_NAME = 'soundcloud:user';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(?<user>[^/]+)(?:\/(?<rsrc>tracks|albums|sets|reposts|likes|spotlight|comments))?\/?(?:[?#].*)?$/;

  static _BASE_URL_MAP: Record<string, string> = {
    all: 'stream/users/%s',
    tracks: 'users/%s/tracks',
    albums: 'users/%s/albums',
    sets: 'users/%s/playlists',
    reposts: 'stream/users/%s/reposts',
    likes: 'users/%s/likes',
    spotlight: 'users/%s/spotlight',
    comments: 'users/%s/comments',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploader = m.groups!.user!;
    const user = (await this._callApi(
      SoundcloudBaseIE._resolvUrl(SoundcloudBaseIE._BASE_URL + uploader),
      uploader,
      'Downloading user info',
      { headers: this._HEADERS },
    )) as Record<string, unknown>;
    const resource = m.groups!.rsrc || 'all';
    return this._extractPlaylist(
      `${SoundcloudBaseIE._API_V2_BASE}${SoundcloudUserIE._BASE_URL_MAP[resource]!.replace('%s', String(user.id))}`,
      str_or_none(user.id) || uploader,
      `${user.username} (${resource.charAt(0).toUpperCase()}${resource.slice(1)})`,
    );
  }
}

export class SoundcloudUserPermalinkIE extends SoundcloudPagedPlaylistBaseIE {
  static IE_NAME = 'soundcloud:user:permalink';
  static _VALID_URL = /https?:\/\/api\.soundcloud\.com\/users\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    const user = (await this._callApi(
      SoundcloudBaseIE._resolvUrl(url),
      userId,
      'Downloading user info',
      { headers: this._HEADERS },
    )) as Record<string, unknown>;
    return this._extractPlaylist(
      `${SoundcloudBaseIE._API_V2_BASE}users/${user.id}/tracks`,
      String(user.id),
      String(user.username || userId),
    );
  }
}

export class SoundcloudTrackStationIE extends SoundcloudPagedPlaylistBaseIE {
  static IE_NAME = 'soundcloud:trackstation';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/stations\/track\/[^/]+\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const trackName = this._match_id(url);
    const track = (await this._callApi(
      SoundcloudBaseIE._resolvUrl(url),
      trackName,
      undefined,
      { headers: this._HEADERS },
    )) as Record<string, unknown>;
    const trackId = this._search_regex(/soundcloud:track-stations:(\d+)/, String(track.id), 'track id')!;
    return this._extractPlaylist(
      `${SoundcloudBaseIE._API_V2_BASE}stations/${track.id}/tracks`,
      trackId,
      `Track station: ${track.title}`,
    );
  }
}

export class SoundcloudRelatedIE extends SoundcloudPagedPlaylistBaseIE {
  static IE_NAME = 'soundcloud:related';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(?<slug>[\w\d-]+\/[\w\d-]+)\/(?<relation>albums|sets|recommended)/;

  static _BASE_URL_MAP: Record<string, string> = {
    albums: 'tracks/%s/albums',
    sets: 'tracks/%s/playlists_without_albums',
    recommended: 'tracks/%s/related',
  };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const slug = m.groups!.slug!;
    const relation = m.groups!.relation!;
    const track = (await this._callApi(
      SoundcloudBaseIE._resolvUrl(SoundcloudBaseIE._BASE_URL + slug),
      slug,
      'Downloading track info',
      { headers: this._HEADERS },
    )) as Record<string, unknown> & { errors?: Record<string, unknown>[] };
    if (track.errors?.length) {
      throw new ExtractorError(
        `${this.IE_NAME} said: ${track.errors.map((e) => e.error_message).join(',')}`,
        { expected: true },
      );
    }
    return this._extractPlaylist(
      `${SoundcloudBaseIE._API_V2_BASE}${SoundcloudRelatedIE._BASE_URL_MAP[relation]!.replace('%s', String(track.id))}`,
      String(track.id),
      `${track.title || slug} (${relation.charAt(0).toUpperCase()}${relation.slice(1)})`,
    );
  }
}

export class SoundcloudPlaylistIE extends SoundcloudPlaylistBaseIE {
  static IE_NAME = 'soundcloud:playlist';
  static _VALID_URL =
    /https?:\/\/api(?:-v2)?\.soundcloud\.com\/playlists\/(?:soundcloud(?:%3A|:)playlists(?:%3A|:))?(?<id>[0-9]+)(?:\/?\?secret_token=(?<token>[^&]+?))?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const token = m.groups!.token;
    const query: Record<string, string> = {};
    if (token) query.secret_token = token;
    const data = (await this._callApi(
      `${SoundcloudBaseIE._API_V2_BASE}playlists/${playlistId}`,
      playlistId,
      'Downloading playlist',
      { query, headers: this._HEADERS },
    )) as Record<string, unknown>;
    return this._extractSet(data, token);
  }
}

export class SoundcloudSearchIE extends SoundcloudBaseIE {
  static override IE_NAME = 'soundcloud:search';
  static IE_DESC = 'Soundcloud search';
  static _SEARCH_KEY = 'scsearch';
  static _MAX_RESULTS_PER_PAGE = 200;
  static _DEFAULT_RESULTS_PER_PAGE = 50;

  override async _real_extract(query: string): Promise<VideoInfo> {
    const q = query.includes(':') ? query.split(':').slice(1).join(':') : query;
    const entries = await this._get_n_results(q, 10);
    return this.playlist_result(entries, q, q);
  }

  protected async _get_n_results(query: string, n: number): Promise<VideoInfo[]> {
    await this._initializePreLogin();
    await this._realInitialize();
    const entries: VideoInfo[] = [];
    let nextUrl: string | undefined = update_url_query(`${SoundcloudBaseIE._API_V2_BASE}search/tracks`, {
      q: query,
      limit: String(Math.min(n, SoundcloudSearchIE._MAX_RESULTS_PER_PAGE)),
      linked_partitioning: '1',
      offset: '0',
      client_id: this._CLIENT_ID,
    });
    for (let page = 1; nextUrl && entries.length < n; page++) {
      const response: { collection?: Record<string, unknown>[]; next_href?: string } =
        await this._download_json(nextUrl, query, `Downloading page ${page}`);
      for (const item of response.collection || []) {
        if (!item || entries.length >= n) break;
        entries.push(
          this.url_result(String(item.uri || item.permalink_url), 'Soundcloud', String(item.id || ''), String(item.title || '')),
        );
      }
      nextUrl = response.next_href;
    }
    return entries;
  }
}
