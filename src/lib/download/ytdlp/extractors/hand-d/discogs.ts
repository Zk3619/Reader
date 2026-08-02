/**
 * DiscogsReleasePlaylistIE — ported from yt-dlp discogs.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const YOUTUBE_URL_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^&]*&)?v=|embed\/)|youtu\.be\/)/i;

export class DiscogsReleasePlaylistIE extends InfoExtractor {
  static IE_NAME = 'discogs:releaseplaylist';
  static _VALID_URL = /https?:\/\/(?:www\.)?discogs\.com\/(?<type>release|master)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const playlistType = m.groups!.type!;
    const displayId = `${playlistType}${playlistId}`;

    const response = await this._download_json<Record<string, unknown>>(
      `https://api.discogs.com/${playlistType}s/${playlistId}`,
      displayId,
    );

    const videos = Array.isArray(response.videos) ? (response.videos as Record<string, unknown>[]) : [];
    const entries = videos
      .filter((v) => YOUTUBE_URL_RE.test(String(v.uri ?? '')))
      .map((video) => ({
        ...this.url_result(String(video.uri), 'Youtube'),
        title: (video.title as string) ?? undefined,
      }));

    return this.playlist_result(entries, displayId, (response.title as string) ?? undefined);
  }
}
