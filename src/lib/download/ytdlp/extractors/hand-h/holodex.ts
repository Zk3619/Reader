/**
 * HolodexIE — ported from yt-dlp holodex.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { playlistFromMatches } from '../hand-a/helpers';

export class HolodexIE extends InfoExtractor {
  static IE_NAME = 'holodex';
  static _VALID_URL =
    /https?:\/\/(?:www\.|staging\.)?holodex\.net\/(?:api\/v2\/playlist\/(?<playlist>\d+)|watch\/(?<id>[\w-]{11})(?:\?(?:[^#]+&)?playlist=(?<playlist2>\d+))?)/;

  protected _yesPlaylist(playlistId: string | null | undefined, videoId: string | null | undefined): boolean {
    if (this.params.noplaylist) {
      if (videoId) this.to_screen('Downloading just video because of --no-playlist');
      return false;
    }
    void playlistId;
    return !!playlistId;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id ?? null;
    const playlistId = m.groups!.playlist || m.groups!.playlist2 || null;

    if (!this._yesPlaylist(playlistId, videoId)) {
      return this.url_result(`https://www.youtube.com/watch?v=${videoId}`, 'Youtube', videoId!);
    }

    const data = await this._download_json<Record<string, unknown>>(
      `https://holodex.net/api/v2/playlist/${playlistId}`,
      playlistId!,
    );
    const videoIds = ((data.videos as Array<Record<string, unknown>>) || [])
      .map((v) => String(v.id ?? ''))
      .filter(Boolean);

    return playlistFromMatches(
      this,
      videoIds.map((id) => `https://www.youtube.com/watch?v=${id}`),
      String(playlistId),
      { title: (data.name as string) ?? undefined, ie: 'Youtube' },
    );
  }
}
