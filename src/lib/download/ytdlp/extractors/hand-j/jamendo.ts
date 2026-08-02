/**
 * JamendoIE / JamendoAlbumIE — ported from yt-dlp jamendo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { clean_html, int_or_none, unified_strdate } from '../../utils';

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class JamendoIE extends InfoExtractor {
  static IE_NAME = 'jamendo';
  static _VALID_URL =
    /https?:\/\/(?:licensing\.jamendo\.com\/[^/]+|(?:www\.)?jamendo\.com)\/track\/(?<id>[0-9]+)(?:\/(?<display_id>[^/?#&]+))?/;

  protected async _callApi(resource: string, resourceId: string, fatal = true): Promise<Record<string, unknown>> {
    const path = `/api/${resource}s`;
    const rand = String(Math.random());
    const rows = await this._download_json<Record<string, unknown>[]>(
      `https://www.jamendo.com${path}`,
      resourceId,
      undefined,
      {
        fatal,
        query: { 'id[]': resourceId },
        headers: {
          'X-Jam-Call': `$${await sha1Hex(path + rand)}*${rand}~`,
        },
      },
    );
    return (rows?.[0] as Record<string, unknown>) || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const trackId = m.groups?.id ?? m[1] ?? '';
    const displayId = m.groups?.display_id ?? undefined;

    const track = await this._callApi('track', trackId);
    const trackName = String(track.name ?? trackId);
    const title = trackName;

    const artist = await this._callApi('artist', String(track.artistId ?? ''), false);
    const album = await this._callApi('album', String(track.albumId ?? ''), false);

    const formatDefs: Array<[string, string, string]> = [
      ['mp31', 'mp3l', 'mp3'],
      ['mp32', 'mp3d', 'mp3'],
      ['ogg1', 'ogg', 'ogg'],
      ['flac', 'flac', 'flac'],
    ];
    const formats: Format[] = formatDefs.map(([formatId, subDomain, ext], quality) => ({
      url: `https://${subDomain}.jamendo.com/?trackid=${trackId}&format=${formatId}&from=app-97dab294`,
      format_id: formatId,
      ext,
      quality,
    }));

    const thumbnails: Thumbnail[] = [];
    const seenUrls = new Set<string>();
    const cover = (track.cover as Record<string, Record<string, string>>) || {};
    for (const covers of Object.values(cover)) {
      for (const [coverId, coverUrl] of Object.entries(covers)) {
        if (!coverUrl || seenUrls.has(coverUrl)) continue;
        seenUrls.add(coverUrl);
        const size = int_or_none(coverId.replace(/^size/, ''));
        thumbnails.push({
          id: coverId,
          url: coverUrl,
          width: size ?? undefined,
          height: size ?? undefined,
        });
      }
    }

    const tags: string[] = [];
    for (const tag of (track.tags as Array<Record<string, unknown>>) || []) {
      const tagName = tag?.name;
      if (tagName) tags.push(String(tagName));
    }

    const stats = (track.stats as Record<string, unknown>) || {};
    const videoLicense = (track.licenseCC as string[]) || [];

    return {
      id: trackId,
      display_id: displayId,
      thumbnails,
      title,
      description: track.description != null ? String(track.description) : undefined,
      duration: int_or_none(track.duration) ?? undefined,
      artist: artist.name != null ? String(artist.name) : undefined,
      track: trackName,
      album: album.name != null ? String(album.name) : undefined,
      formats,
      license: videoLicense.length ? videoLicense.join('-') : undefined,
      timestamp: int_or_none(track.dateCreated) ?? undefined,
      upload_date: unified_strdate(track.dateCreated) ?? undefined,
      view_count: int_or_none(stats.listenedAll) ?? undefined,
      like_count: int_or_none(stats.favorited) ?? undefined,
      average_rating: int_or_none(stats.averageNote) ?? undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}

export class JamendoAlbumIE extends JamendoIE {
  static IE_NAME = 'jamendoalbum';
  static _VALID_URL = /https?:\/\/(?:www\.)?jamendo\.com\/album\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumId = this._match_id(url);
    const album = await this._callApi('album', albumId);
    const albumName = album.name != null ? String(album.name) : undefined;

    const entries: VideoInfo[] = [];
    for (const track of (album.tracks as Array<Record<string, unknown>>) || []) {
      const rawId = track?.id;
      if (rawId == null) continue;
      const trackId = String(rawId);
      entries.push({
        _type: 'url_transparent',
        url: `https://www.jamendo.com/track/${trackId}`,
        extractor: 'Jamendo',
        extractor_key: 'Jamendo',
        id: trackId,
        album: albumName,
      });
    }

    const albumDesc = album.description as Record<string, string> | undefined;
    const descEn = albumDesc?.en;
    return this.playlist_result(
      entries,
      albumId,
      albumName,
      descEn ? clean_html(descEn) ?? undefined : undefined,
    );
  }
}
