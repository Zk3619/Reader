/** StagePlusVODConcertIE — ported from yt-dlp stageplus.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { float_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

const GRAPHQL_QUERY = `query videoDetailPage($videoId: ID!, $sliderItemsFirst: Int = 24) {
  node(id: $videoId) {
    __typename
    ... on VodConcert {
      title
      shortDescription
      archiveReleaseDate
      productionDate
      pictures { url type }
      performanceWorks {
        id
        duration
        stream { url }
        work { title composers { name } genre { title } }
        artists { edges { node { name } } }
        cuePoints { mark title }
      }
    }
  }
}`;

export class StagePlusVODConcertIE extends InfoExtractor {
  static IE_NAME = 'stageplus:vod';
  static _NETRC_MACHINE = 'stageplus';
  static _VALID_URL = /https?:\/\/(?:www\.)?stage-plus\.com\/video\/(?<id>vod_concert_\w+)/;

  protected _TOKEN: string | null = null;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const auth = await this._download_json<{ access_token?: string }>(
      'https://audience.api.stageplus.io/oauth/token',
      'login',
      'Logging in',
      {
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.stage-plus.com' },
        data: JSON.stringify({
          grant_type: 'password',
          username,
          password,
          device_info: 'Chrome (Windows)',
          client_device_id: crypto.randomUUID?.() || String(Date.now()),
        }),
      },
    );
    if (auth.access_token) this._TOKEN = auth.access_token;
  }

  protected async _ensureToken(): Promise<void> {
    if (this._TOKEN) return;
    this._TOKEN =
      (this._get_cookies('https://www.stage-plus.com/')['dgplus_access_token'] as string | undefined) ||
      null;
    if (!this._TOKEN) this.raise_login_required();
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._ensureToken();
    const concertId = this._match_id(url);
    const resp = await this._download_json<{ data?: { node?: Record<string, unknown> } }>(
      'https://audience.api.stageplus.io/graphql',
      concertId,
      undefined,
      {
        headers: {
          authorization: `Bearer ${this._TOKEN}`,
          'content-type': 'application/json',
          Origin: 'https://www.stage-plus.com',
        },
        data: JSON.stringify({
          query: GRAPHQL_QUERY,
          variables: { videoId: concertId },
          operationName: 'videoDetailPage',
        }),
      },
    );
    const data = resp.data?.node || {};

    const metadata: Partial<VideoInfo> = {
      title: data.title as string | undefined,
      description: data.shortDescription != null ? String(data.shortDescription) : undefined,
      artists: traverse_obj(data, ['performanceWorks', 0, 'artists', 'edges']) as unknown as string[] | undefined,
      timestamp: unified_timestamp(data.archiveReleaseDate) ?? undefined,
      release_timestamp: unified_timestamp(data.productionDate) ?? undefined,
    };

    const thumbnails: Thumbnail[] = [];
    for (const pic of (data.pictures as Record<string, unknown>[]) || []) {
      const picUrl = url_or_none(pic.url);
      if (picUrl) thumbnails.push({ id: String(pic.type || ''), url: picUrl });
    }

    const entries: VideoInfo[] = [];
    let idx = 0;
    for (const video of (data.performanceWorks as Record<string, unknown>[]) || []) {
      const streamUrl = url_or_none(traverse_obj(video, ['stream', 'url']));
      if (!video.id || !streamUrl) continue;
      idx++;
      const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
        this,
        streamUrl,
        String(video.id),
        'hls',
      );
      entries.push({
        id: String(video.id),
        formats,
        subtitles,
        album: metadata.title,
        album_artists: metadata.artists,
        track_number: idx,
        ...metadata,
        title: traverse_obj(video, ['work', 'title']) as string | undefined,
        track: traverse_obj(video, ['work', 'title']) as string | undefined,
        duration: float_or_none(video.duration) ?? undefined,
        artists: traverse_obj(video, ['artists', 'edges']) as unknown as string[] | undefined,
        genre: traverse_obj(video, ['work', 'genre', 'title']) as string | undefined,
      });
    }

    return this.playlist_result(entries, concertId, metadata.title, undefined);
  }
}
