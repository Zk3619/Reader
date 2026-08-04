// @ts-nocheck
/**
 * YandexMusic* IEs �?ported from yt-dlp yandexmusic.py (pragmatic main-path).
 */

import { createHash } from 'node:crypto';

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, try_get } from '../../utils';

const VALID_URL_BASE = String.raw`https?://music\.yandex\.(?<tld>ru|kz|ua|by|com)`;

export class YandexMusicBaseIE extends InfoExtractor {
  static IE_NAME = 'yandexmusic:base';
  static _VALID_URL = false as const;

  protected static _raise_captcha(): never {
    throw new ExtractorError(
      'YandexMusic has considered requests automated and asks you to solve a CAPTCHA. ' +
        'Wait, use --sleep-interval, or pass cookies from https://music.yandex.ru/',
      { expected: true },
    );
  }

  protected _handle_error(response: unknown): void {
    if (response && typeof response === 'object') {
      const r = response as Record<string, unknown>;
      if (r.error) throw new ExtractorError(String(r.error), { expected: true });
      if (r.type === 'captcha' || 'captcha' in r) YandexMusicBaseIE._raise_captcha();
    }
  }

  protected async _call_api(
    ep: string,
    tld: string,
    url: string,
    itemId: string,
    note: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await this._download_json<Record<string, unknown>>(
      `https://music.yandex.${tld}/handlers/${ep}.jsx`,
      itemId,
      note,
      {
        fatal: false,
        headers: {
          Referer: url,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Retpath-Y': url,
        },
        query,
      },
    );
    this._handle_error(response);
    return response || {};
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('YandexMusicBaseIE is not a standalone extractor', {
      expected: true,
    });
  }
}

export class YandexMusicTrackIE extends YandexMusicBaseIE {
  static IE_NAME = 'yandexmusic:track';
  static IE_DESC = 'Яндекс.Музыка - Трек';
  static _VALID_URL = new RegExp(
    `${VALID_URL_BASE}/album/(?<album_id>\\d+)/track/(?<id>\\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const albumId = mobj.groups!.album_id!;
    const trackId = mobj.groups!.id!;

    const trackResp = await this._call_api(
      'track',
      tld,
      url,
      trackId,
      'Downloading track JSON',
      { track: `${trackId}:${albumId}` },
    );
    const track = trackResp.track as Record<string, unknown>;
    const trackTitle = String(track.title || trackId);

    const downloadData = await this._download_json<Record<string, unknown>>(
      `https://music.yandex.ru/api/v2.1/handlers/track/${trackId}:${albumId}/web-album_track-track-track-main/download/m`,
      trackId,
      'Downloading track location url JSON',
      { query: { hq: '1' }, headers: { 'X-Retpath-Y': url } },
    );

    const fdData = await this._download_json<Record<string, unknown>>(
      String(downloadData.src),
      trackId,
      'Downloading track location JSON',
      { query: { format: 'json' } },
    );
    const key = createHash('md5')
      .update(`XGRlBW9FXlekgbPrRHuSiA${String(fdData.path).slice(1)}${fdData.s}`)
      .digest('hex');
    const fUrl = `http://${fdData.host}/get-mp3/${key}/${fdData.ts}${fdData.path}?track-id=${track.id}`;

    let thumbnail: string | undefined;
    const coverUri = try_get(track, (x) =>
      String(((x.albums as Array<Record<string, unknown>>) || [{}])[0]?.coverUri || ''),
    );
    if (coverUri) {
      thumbnail = coverUri.replace('%%', 'orig');
      if (!thumbnail.startsWith('http')) thumbnail = `http://${thumbnail}`;
    }

    const extractArtistName = (artist: Record<string, unknown>): string => {
      const decomposed = artist.decomposed;
      if (!Array.isArray(decomposed)) return String(artist.name || '');
      const parts = [String(artist.name || '')];
      for (const element of decomposed) {
        if (element && typeof element === 'object' && (element as Record<string, unknown>).name) {
          parts.push(String((element as Record<string, unknown>).name));
        } else if (typeof element === 'string') {
          parts.push(element);
        }
      }
      return parts.join('');
    };

    const extractArtist = (artistList: unknown): string | undefined => {
      if (!Array.isArray(artistList)) return undefined;
      const names = artistList
        .filter((a) => a && typeof a === 'object' && (a as Record<string, unknown>).name)
        .map((a) => extractArtistName(a as Record<string, unknown>));
      return names.length ? names.join(', ') : undefined;
    };

    const trackInfo: VideoInfo = {
      id: trackId,
      ext: 'mp3',
      url: fUrl,
      title: trackTitle,
      filesize: int_or_none(track.fileSize) ?? undefined,
      duration: float_or_none(track.durationMs, 1000) ?? undefined,
      thumbnail,
      track: trackTitle,
      acodec: downloadData.codec != null ? String(downloadData.codec) : undefined,
      abr: int_or_none(downloadData.bitrate) ?? undefined,
    };

    const albums = track.albums;
    if (Array.isArray(albums) && albums[0] && typeof albums[0] === 'object') {
      const album = albums[0] as Record<string, unknown>;
      trackInfo.album = album.title != null ? String(album.title) : undefined;
      trackInfo.album_artist = extractArtist(album.artists);
      trackInfo.release_year = int_or_none(album.year) ?? undefined;
      trackInfo.genre = album.genre != null ? String(album.genre) : undefined;
      trackInfo.disc_number =
        int_or_none(
          try_get(album, (x) => (x.trackPosition as Record<string, unknown>)?.volume),
        ) ?? undefined;
      trackInfo.track_number =
        int_or_none(
          try_get(album, (x) => (x.trackPosition as Record<string, unknown>)?.index),
        ) ?? undefined;
    }

    const trackArtist = extractArtist(track.artists);
    if (trackArtist) {
      trackInfo.artist = trackArtist;
      trackInfo.title = `${trackArtist} - ${trackTitle}`;
    }

    return trackInfo;
  }
}

export class YandexMusicPlaylistBaseIE extends YandexMusicBaseIE {
  static IE_NAME = 'yandexmusic:playlistbase';
  static _VALID_URL = false as const;

  protected async _extract_tracks(
    source: Record<string, unknown>,
    itemId: string,
    url: string,
    tld: string,
  ): Promise<Array<Record<string, unknown>>> {
    let tracks = [...((source.tracks as Array<Record<string, unknown>>) || [])];
    const trackIds = ((source.trackIds as unknown[]) || []).map(String);

    if (tracks.length < trackIds.length) {
      const present = new Set(
        tracks.filter((t) => t.id != null).map((t) => String(t.id)),
      );
      const missing = trackIds.filter((id) => !present.has(id));
      const CHUNK = 250;
      for (let start = 0; start < missing.length; start += CHUNK) {
        const chunk = missing.slice(start, start + CHUNK);
        const missingTracks = await this._call_api(
          'track-entries',
          tld,
          url,
          itemId,
          `Downloading missing tracks JSON chunk ${Math.floor(start / CHUNK) + 1}`,
          {
            entries: chunk.join(','),
            lang: tld,
            'external-domain': `music.yandex.${tld}`,
            overembed: 'false',
            strict: 'true',
          },
        );
        if (Array.isArray(missingTracks)) {
          tracks = tracks.concat(missingTracks as Array<Record<string, unknown>>);
        }
      }
    }
    return tracks;
  }

  protected _build_playlist(tracks: Array<Record<string, unknown>>): VideoInfo[] {
    const entries: VideoInfo[] = [];
    for (const track of tracks) {
      const trackId = track.id ?? track.realId;
      if (trackId == null) continue;
      const albums = track.albums;
      if (!Array.isArray(albums) || !albums[0] || typeof albums[0] !== 'object') continue;
      const albumId = (albums[0] as Record<string, unknown>).id;
      if (albumId == null) continue;
      entries.push(
        this.url_result(
          `http://music.yandex.ru/album/${albumId}/track/${trackId}`,
          YandexMusicTrackIE.IE_NAME,
          String(trackId),
        ),
      );
    }
    return entries;
  }
}

export class YandexMusicAlbumIE extends YandexMusicPlaylistBaseIE {
  static IE_NAME = 'yandexmusic:album';
  static IE_DESC = 'Яндекс.Музыка - Альбом';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}/album/(?<id>\\d+)`);

  static suitable(url: string): boolean {
    return !YandexMusicTrackIE.suitable(url) && super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const albumId = mobj.groups!.id!;

    const album = await this._call_api('album', tld, url, albumId, 'Downloading album JSON', {
      album: albumId,
    });

    const volumes = (album.volumes as unknown[][]) || [];
    const tracks = volumes.flatMap((v) =>
      Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [],
    );
    const entries = this._build_playlist(tracks);

    let title = String(album.title || albumId);
    const artist = try_get(album, (x) =>
      String(((x.artists as Array<Record<string, unknown>>) || [])[0]?.name || ''),
    );
    if (artist) title = `${artist} - ${title}`;
    if (album.year) title += ` (${album.year})`;

    return this.playlist_result(entries, String(album.id || albumId), title);
  }
}

export class YandexMusicPlaylistIE extends YandexMusicPlaylistBaseIE {
  static IE_NAME = 'yandexmusic:playlist';
  static IE_DESC = 'Яндекс.Музыка - Плейлист';
  static _VALID_URL = new RegExp(
    `${VALID_URL_BASE}/users/(?<user>[^/]+)/playlists/(?<id>\\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const user = mobj.groups!.user!;
    const playlistId = mobj.groups!.id!;

    const playlistWrap = await this._call_api(
      'playlist',
      tld,
      url,
      playlistId,
      'Downloading playlist JSON',
      {
        owner: user,
        kinds: playlistId,
        light: 'true',
        lang: tld,
        'external-domain': `music.yandex.${tld}`,
        overembed: 'false',
      },
    );
    const playlist = (playlistWrap.playlist as Record<string, unknown>) || {};
    const tracks = await this._extract_tracks(playlist, playlistId, url, tld);

    return this.playlist_result(
      this._build_playlist(tracks),
      playlistId,
      playlist.title != null ? String(playlist.title) : undefined,
      playlist.description != null ? String(playlist.description) : undefined,
    );
  }
}

export class YandexMusicArtistBaseIE extends YandexMusicPlaylistBaseIE {
  static IE_NAME = 'yandexmusic:artist:base';
  static _VALID_URL = false as const;
  protected _ARTIST_SORT = '';
  protected _ARTIST_WHAT = 'tracks';

  protected async _call_artist(
    tld: string,
    url: string,
    artistId: string,
  ): Promise<Record<string, unknown>> {
    return this._call_api(
      'artist',
      tld,
      url,
      artistId,
      `Downloading artist ${this._ARTIST_WHAT} JSON`,
      {
        artist: artistId,
        what: this._ARTIST_WHAT,
        sort: this._ARTIST_SORT || '',
        dir: '',
        period: '',
        lang: tld,
        'external-domain': `music.yandex.${tld}`,
        overembed: 'false',
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const artistId = mobj.groups!.id!;
    const data = await this._call_artist(tld, url, artistId);
    const tracks = await this._extract_tracks(data, artistId, url, tld);
    const title = try_get(data, (x) =>
      String((x.artist as Record<string, unknown>)?.name || ''),
    );
    return this.playlist_result(this._build_playlist(tracks), artistId, title || undefined);
  }
}

export class YandexMusicArtistTracksIE extends YandexMusicArtistBaseIE {
  static IE_NAME = 'yandexmusic:artist:tracks';
  static IE_DESC = 'Яндекс.Музыка - Артист - Треки';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}/artist/(?<id>\\d+)/tracks`);
  protected _ARTIST_SORT = '';
  protected _ARTIST_WHAT = 'tracks';

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const artistId = mobj.groups!.id!;
    const data = await this._call_artist(tld, url, artistId);
    const tracks = await this._extract_tracks(data, artistId, url, tld);
    const artist = try_get(data, (x) =>
      String((x.artist as Record<string, unknown>)?.name || ''),
    );
    const title = `${artist || artistId} - Треки`;
    return this.playlist_result(this._build_playlist(tracks), artistId, title);
  }
}

export class YandexMusicArtistAlbumsIE extends YandexMusicArtistBaseIE {
  static IE_NAME = 'yandexmusic:artist:albums';
  static IE_DESC = 'Яндекс.Музыка - Артист - Альбомы';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE}/artist/(?<id>\\d+)/albums`);
  protected _ARTIST_SORT = 'year';
  protected _ARTIST_WHAT = 'albums';

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const tld = mobj.groups!.tld!;
    const artistId = mobj.groups!.id!;
    const data = await this._call_artist(tld, url, artistId);
    const entries: VideoInfo[] = [];
    for (const album of (data.albums as Array<Record<string, unknown>>) || []) {
      if (!album || typeof album !== 'object') continue;
      const albumId = album.id;
      if (albumId == null) continue;
      entries.push(
        this.url_result(
          `http://music.yandex.ru/album/${albumId}`,
          YandexMusicAlbumIE.IE_NAME,
          String(albumId),
        ),
      );
    }
    const artist = try_get(data, (x) =>
      String((x.artist as Record<string, unknown>)?.name || ''),
    );
    const title = `${artist || artistId} - Альбомы`;
    return this.playlist_result(entries, artistId, title);
  }
}
