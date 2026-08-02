/**
 * AudiusIE / AudiusTrackIE / AudiusPlaylistIE / AudiusProfileIE — aligned with yt-dlp audius.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, url_or_none } from '../../utils';

abstract class AudiusBaseIE extends InfoExtractor {
  protected apiBase: string | null = null;

  protected getResponseData(response: unknown): unknown {
    if (response && typeof response === 'object') {
      const data = (response as Record<string, unknown>).data;
      if (data !== undefined) return data;
      if (Object.keys(response as object).length === 1 && 'message' in (response as object)) {
        throw new ExtractorError(`API error: ${(response as Record<string, unknown>).message}`, { expected: true });
      }
    }
    throw new ExtractorError('Unexpected API response');
  }

  protected async selectApiBase(): Promise<string> {
    if (this.apiBase) return this.apiBase;
    const response = await this._download_json<unknown>(
      'https://api.audius.co/',
      undefined,
      'Requesting available API hosts',
    );
    const hosts = this.getResponseData(response);
    if (Array.isArray(hosts) && hosts.length) {
      this.apiBase = String(hosts[Math.floor(Math.random() * hosts.length)]);
      return this.apiBase;
    }
    throw new ExtractorError('Unable to get available API hosts', { expected: true });
  }

  protected prepareUrl(pageUrl: string, title: string): string {
    const decodedTitle = decodeURIComponent(title);
    if (decodedTitle.includes('/') || decodedTitle.includes('%2F')) {
      const fixed = decodedTitle.replace(/\//g, '%5C').replace(/%2F/gi, '%5C');
      return pageUrl.replace(title, fixed);
    }
    return pageUrl;
  }

  protected async apiRequest(path: string, itemId?: string, note?: string): Promise<unknown> {
    const base = await this.selectApiBase();
    try {
      const response = await this._download_json<unknown>(`${base}/v1${path}`, itemId, note);
      return this.getResponseData(response);
    } catch (e) {
      if (String(e).includes('JSON')) {
        throw new ExtractorError('An error occurred while receiving data. Try again', { expected: true });
      }
      throw e;
    }
  }

  protected async resolveUrl(pageUrl: string, itemId: string): Promise<unknown> {
    return this.apiRequest(`/resolve?url=${encodeURIComponent(pageUrl)}`, itemId);
  }

  protected buildTrackInfo(trackData: Record<string, unknown>, fallbackTitle?: string): VideoInfo {
    const trackId = str_or_none(trackData.id);
    if (!trackId) throw new ExtractorError('Unable to get ID of the track', { expected: true });
    const base = this.apiBase!;
    const thumbnails: VideoInfo['thumbnails'] = [];
    const artworks = trackData.artwork as Record<string, string> | undefined;
    if (artworks) {
      for (const [key, thumbUrl] of Object.entries(artworks)) {
        const u = url_or_none(thumbUrl);
        if (!u) continue;
        const pref = { '150x150': 150, '480x480': 480, '1000x1000': 1000 }[key];
        thumbnails.push({ url: u, preference: pref });
      }
    }
    return {
      id: trackId,
      title: str_or_none(trackData.title) || fallbackTitle || trackId,
      url: `${base}/v1/tracks/${trackId}/stream`,
      formats: [{ format_id: 'stream', url: `${base}/v1/tracks/${trackId}/stream`, ext: 'mp3' }],
      ext: 'mp3',
      description: str_or_none(trackData.description) || null,
      duration: trackData.duration as number | undefined,
      track: str_or_none(trackData.title) || undefined,
      artist: str_or_none((trackData.user as Record<string, unknown>)?.name) || undefined,
      genre: str_or_none(trackData.genre) || undefined,
      thumbnails,
      view_count: trackData.play_count as number | undefined,
      like_count: trackData.favorite_count as number | undefined,
      repost_count: trackData.repost_count as number | undefined,
      extractor: 'audius',
      extractor_key: 'Audius',
    };
  }

  protected buildPlaylistEntries(tracks: unknown[]): VideoInfo[] {
    const entries: VideoInfo[] = [];
    for (const track of tracks) {
      if (!track || typeof track !== 'object') throw new ExtractorError('Unexpected API response');
      const trackId = str_or_none((track as Record<string, unknown>).id);
      if (!trackId) throw new ExtractorError('Unable to get track ID from playlist');
      entries.push(this.url_result(`audius:${trackId}`, 'AudiusTrack', trackId));
    }
    return entries;
  }
}

export class AudiusIE extends AudiusBaseIE {
  static IE_NAME = 'audius';
  static IE_DESC = 'Audius.co';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?audius\.co\/(?<uploader>[\w\d-]+)(?!\/album|\/playlist)\/(?<title>\S+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const title = m.groups?.title ?? m[2] ?? '';
    const resolved = await this.resolveUrl(this.prepareUrl(url, title), title);
    if (!resolved || typeof resolved !== 'object') throw new ExtractorError('Unexpected API response');
    return this.buildTrackInfo(resolved as Record<string, unknown>, title);
  }
}

export class AudiusTrackIE extends AudiusBaseIE {
  static IE_NAME = 'audius:track';
  static IE_DESC = 'Audius track ID or API link';
  static _VALID_URL = /(?:audius:)(?:https?:\/\/(?:www\.)?.+\/v1\/tracks\/)?(?<track_id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const trackId = this._match_id(url);
    await this.selectApiBase();
    const trackData = (await this.apiRequest(`/tracks/${trackId}`, trackId)) as Record<string, unknown>;
    return this.buildTrackInfo(trackData);
  }
}

export class AudiusPlaylistIE extends AudiusBaseIE {
  static IE_NAME = 'audius:playlist';
  static IE_DESC = 'Audius.co playlists';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?audius\.co\/(?<uploader>[\w\d-]+)\/(?:album|playlist)\/(?<title>\S+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    await this.selectApiBase();
    const m = this._match_valid_url(url)!;
    const title = m.groups?.title ?? m[2] ?? '';
    const playlistResponse = await this.resolveUrl(this.prepareUrl(url, title), title);
    if (!Array.isArray(playlistResponse) || playlistResponse.length !== 1) {
      throw new ExtractorError('Unexpected API response');
    }
    const playlistData = playlistResponse[0] as Record<string, unknown>;
    const playlistId = str_or_none(playlistData.id);
    if (!playlistId) throw new ExtractorError('Unable to get playlist ID');
    const tracks = (await this.apiRequest(
      `/playlists/${playlistId}/tracks`,
      title,
      'Downloading playlist tracks metadata',
    )) as unknown[];
    return this.playlist_result(
      this.buildPlaylistEntries(tracks),
      playlistId,
      str_or_none(playlistData.playlist_name) || title,
      str_or_none(playlistData.description),
    );
  }
}

export class AudiusProfileIE extends AudiusPlaylistIE {
  static IE_NAME = 'audius:artist';
  static IE_DESC = 'Audius.co profile/artist pages';
  static _VALID_URL = /https?:\/\/(?:www)?audius\.co\/(?<id>[^/]+)\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    await this.selectApiBase();
    const profileId = this._match_id(url);
    const profileData = (await this.apiRequest(`/full/users/handle/${profileId}`, profileId)) as unknown[];
    const profile = profileData[0] as Record<string, unknown>;
    const audiusId = str_or_none(profile.id);
    const bio = str_or_none(profile.bio);
    const tracks = (await this.apiRequest(`/full/users/handle/${profileId}/tracks`, profileId)) as unknown[];
    return this.playlist_result(this.buildPlaylistEntries(tracks), audiusId || profileId, profileId, bio);
  }
}
