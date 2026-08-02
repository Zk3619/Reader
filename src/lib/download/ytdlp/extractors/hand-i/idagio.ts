/**
 * Idagio family — ported from yt-dlp idagio.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';

function extractIdagioArtists(recording: Record<string, unknown> | undefined): string[] {
  if (!recording) return [];
  const names: string[] = [];
  const conductor = traverse_obj(recording, ['conductor', 'name']) as string | undefined;
  if (conductor) names.push(conductor);
  for (const ensemble of (recording.ensembles as Array<Record<string, unknown>>) || []) {
    const name = ensemble.name as string | undefined;
    if (name) names.push(name);
  }
  for (const soloist of (recording.soloists as Array<Record<string, unknown>>) || []) {
    const name = soloist.name as string | undefined;
    if (name) names.push(name);
  }
  return names;
}

function extractIdagioComposers(piece: Record<string, unknown> | undefined): string[] {
  const composer = traverse_obj(piece, ['workpart', 'work', 'composer', 'name']) as string | undefined;
  return composer ? [composer] : [];
}

function extractIdagioGenres(piece: Record<string, unknown> | undefined): string[] {
  const work = traverse_obj(piece, ['workpart', 'work']) as Record<string, unknown> | undefined;
  if (!work) return [];
  const genres: string[] = [];
  for (const key of ['genre', 'subgenre'] as const) {
    const title = traverse_obj(work, [key, 'title']) as string | undefined;
    if (title) genres.push(title);
  }
  return genres;
}

export class IdagioTrackIE extends InfoExtractor {
  static IE_NAME = 'idagio:track';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?app\.idagio\.com(?:\/[a-z]{2})?\/recordings\/\d+\?(?:[^#]+&)?trackId=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const trackId = this._match_id(url);
    const trackInfo = await this._download_json<Record<string, unknown>>(
      `https://api.idagio.com/v2.0/metadata/tracks/${trackId}`,
      trackId,
      undefined,
      { fatal: false },
    );
    if (traverse_obj(trackInfo, ['error_code']) === 'idagio.error.blocked.location') {
      this.raise_geo_restricted();
    }

    const contentInfo = await this._download_json<Record<string, unknown>>(
      `https://api.idagio.com/v1.8/content/track/${trackId}`,
      trackId,
      undefined,
      {
        query: { quality: '0', format: '2', client_type: 'web-4' },
      },
    );

    const result = (trackInfo.result as Record<string, unknown>) || {};
    const piece = (result.piece as Record<string, unknown>) || {};
    const recording = (result.recording as Record<string, unknown>) || {};

    return {
      ext: 'mp3',
      vcodec: 'none',
      id: trackId,
      url: url_or_none(contentInfo.url) ?? undefined,
      title: piece.title as string | undefined,
      timestamp: int_or_none(recording.created_at, 1000) ?? undefined,
      location: recording.location as string | undefined,
      duration: int_or_none(result.duration) ?? undefined,
      track: piece.title as string | undefined,
      artists: extractIdagioArtists(recording),
      composers: extractIdagioComposers(piece),
      genres: extractIdagioGenres(piece),
    };
  }
}

export class IdagioPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'idagioplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected _API_URL_TMPL = '';
  protected _PLAYLIST_ID_KEY: 'id' | 'display_id' = 'id';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('IdagioPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected _entries(playlistInfo: Record<string, unknown>): VideoInfo[] {
    const tracks = (playlistInfo.tracks as Array<Record<string, unknown>>) || [];
    return tracks
      .filter((track) => track.id && (track.recording as Record<string, unknown>)?.id)
      .map((track) => {
        const trackId = String(track.id);
        const recordingId = String((track.recording as Record<string, unknown>).id);
        return this.url_result(
          `https://app.idagio.com/recordings/${recordingId}?trackId=${trackId}`,
          'IdagioTrack',
          trackId,
        );
      });
  }

  protected _parsePlaylistMetadata(_playlistInfo: Record<string, unknown>): Partial<VideoInfo> {
    return {};
  }

  protected async _extractPlaylist(_url: string, playlistId: string): Promise<VideoInfo> {
    const response = await this._download_json<Record<string, unknown>>(
      this._API_URL_TMPL.replace('{}', playlistId),
      playlistId,
    );
    const playlistInfo = (response.result as Record<string, unknown>) || {};
    const meta = this._parsePlaylistMetadata(playlistInfo);
    const idKey = this._PLAYLIST_ID_KEY;
    return {
      _type: 'playlist',
      [idKey]: playlistId,
      entries: this._entries(playlistInfo),
      ...meta,
    } as VideoInfo;
  }
}

export class IdagioRecordingIE extends IdagioPlaylistBaseIE {
  static IE_NAME = 'idagio:recording';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?app\.idagio\.com(?:\/[a-z]{2})?\/recordings\/(?<id>\d+)(?![^#]*[&?]trackId=\d+)/;
  protected _API_URL_TMPL = 'https://api.idagio.com/v2.0/metadata/recordings/{}';
  protected _PLAYLIST_ID_KEY = 'id' as const;

  protected _parsePlaylistMetadata(playlistInfo: Record<string, unknown>): Partial<VideoInfo> {
    const work = (playlistInfo.work as Record<string, unknown>) || {};
    const composerName = (work.composer as Record<string, unknown> | undefined)?.name;
    return {
      title: work.title as string | undefined,
      timestamp: int_or_none(playlistInfo.created_at, 1000) ?? undefined,
      modified_timestamp: int_or_none(playlistInfo.created_at, 1000) ?? undefined,
      location: playlistInfo.location as string | undefined,
      artists: extractIdagioArtists(playlistInfo),
      composers: composerName ? [String(composerName)] : [],
      genres: extractIdagioGenres({ workpart: { work } }),
      tags: ((playlistInfo.tags as string[]) || []).map(String),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}

export class IdagioAlbumIE extends IdagioPlaylistBaseIE {
  static IE_NAME = 'idagio:album';
  static _VALID_URL = /https?:\/\/(?:www\.)?app\.idagio\.com(?:\/[a-z]{2})?\/albums\/(?<id>[\w-]+)/;
  protected _API_URL_TMPL = 'https://api.idagio.com/v2.0/metadata/albums/{}';
  protected _PLAYLIST_ID_KEY = 'display_id' as const;

  protected _parsePlaylistMetadata(playlistInfo: Record<string, unknown>): Partial<VideoInfo> {
    return {
      id: str_or_none(playlistInfo.id) ?? undefined,
      title: playlistInfo.title as string | undefined,
      timestamp: unified_timestamp(playlistInfo.publishDate) ?? undefined,
      modified_timestamp: unified_timestamp(playlistInfo.lastModified) ?? undefined,
      thumbnail: url_or_none(playlistInfo.imageUrl) ?? undefined,
      description: playlistInfo.description as string | undefined,
      artists: ((playlistInfo.participants as Array<Record<string, unknown>>) || [])
        .map((p) => p.name as string)
        .filter(Boolean),
      tags: ((playlistInfo.tags as string[]) || []).map(String),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const result = await this._extractPlaylist(url, playlistId);
    return { ...result, display_id: playlistId };
  }
}

export class IdagioPlaylistIE extends IdagioPlaylistBaseIE {
  static IE_NAME = 'idagio:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?app\.idagio\.com(?:\/[a-z]{2})?\/playlists\/(?!personal\/)(?<id>[\w-]+)/;
  protected _API_URL_TMPL = 'https://api.idagio.com/v2.0/playlists/{}';
  protected _PLAYLIST_ID_KEY = 'display_id' as const;

  protected _parsePlaylistMetadata(playlistInfo: Record<string, unknown>): Partial<VideoInfo> {
    const curator = (playlistInfo.curator as Record<string, unknown>) || {};
    return {
      id: str_or_none(playlistInfo.id) ?? undefined,
      title: playlistInfo.title as string | undefined,
      thumbnail: url_or_none(playlistInfo.imageUrl) ?? undefined,
      description: playlistInfo.description as string | undefined,
      creators: curator.name ? [String(curator.name)] : undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const result = await this._extractPlaylist(url, playlistId);
    return { ...result, display_id: playlistId };
  }
}

export class IdagioPersonalPlaylistIE extends IdagioPlaylistBaseIE {
  static IE_NAME = 'idagio:personal-playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?app\.idagio\.com(?:\/[a-z]{2})?\/playlists\/personal\/(?<id>[\da-f-]+)/;
  protected _API_URL_TMPL = 'https://api.idagio.com/v1.0/personal-playlists/{}';
  protected _PLAYLIST_ID_KEY = 'id' as const;

  protected _parsePlaylistMetadata(playlistInfo: Record<string, unknown>): Partial<VideoInfo> {
    return {
      title: playlistInfo.title as string | undefined,
      thumbnail: url_or_none(playlistInfo.image_url) ?? undefined,
      creators: playlistInfo.user_id ? [String(playlistInfo.user_id)] : undefined,
      timestamp: int_or_none(playlistInfo.created_at, 1000) ?? undefined,
      modified_timestamp: int_or_none(playlistInfo.updated_at, 1000) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}
