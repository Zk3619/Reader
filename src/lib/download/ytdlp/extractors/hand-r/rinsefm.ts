/** RinseFM* — ported from yt-dlp rinsefm.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { determine_ext, traverse_obj, url_or_none } from '../../utils';
import { KNOWN_MEDIA_EXTENSIONS } from '../hand-a/helpers';
import { parseIso8601 } from './_helpers';

export class RinseFMBaseIE extends InfoExtractor {
  static IE_NAME = 'RinseFMBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _API_BASE = 'https://rinse.fm/api/query/v1';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RinseFMBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseEntry(entry: Record<string, unknown>): VideoInfo {
    const thumbFile = traverse_obj(entry, ['featuredImage', 0, 'filename']) as string | undefined;
    const slug = traverse_obj(entry, ['slug']) as string | undefined;
    return {
      id: String(entry.id ?? ''),
      title: traverse_obj(entry, ['title']) as string | undefined,
      url: url_or_none(traverse_obj(entry, ['fileUrl']) as string) ?? undefined,
      release_timestamp: parseIso8601(traverse_obj(entry, ['episodeDate']) as string) ?? undefined,
      thumbnail: thumbFile ? `https://rinse.imgix.net/media/${thumbFile}` : undefined,
      webpage_url: slug ? `https://rinse.fm/episodes/${slug}` : undefined,
      vcodec: 'none',
      extractor_key: 'RinseFM',
      extractor: RinseFMIE.IE_NAME,
    };
  }
}

export class RinseFMIE extends RinseFMBaseIE {
  static IE_NAME = 'rinsefm';
  static _VALID_URL = /https?:\/\/(?:www\.)?rinse\.fm\/episodes\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const resp = await this._download_json<{ entry?: Record<string, unknown> }>(
      `${RinseFMBaseIE._API_BASE}/episodes/${displayId}`,
      displayId,
      'Downloading episode data from API',
    );
    return this._parseEntry(resp.entry || {});
  }
}

export class RinseFMArtistPlaylistIE extends RinseFMBaseIE {
  static IE_NAME = 'rinsefm:artist';
  static _VALID_URL = /https?:\/\/(?:www\.)?rinse\.fm\/shows\/(?<id>[^/?#]+)/;

  protected *_entries(data: Record<string, unknown>): Generator<VideoInfo> {
    for (const episode of (data.episodes as Array<Record<string, unknown>>) || []) {
      const fileUrl = episode.fileUrl as string | undefined;
      if (!fileUrl || !KNOWN_MEDIA_EXTENSIONS.has(determine_ext(fileUrl))) continue;
      yield this._parseEntry(episode);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const apiData = await this._download_json<{ entry?: Record<string, unknown>; episodes?: unknown[] }>(
      `${RinseFMBaseIE._API_BASE}/shows/${playlistId}`,
      playlistId,
      'Downloading show data from API',
    );
    const entry = apiData.entry || {};
    return this.playlist_result(
      [...this._entries(apiData as Record<string, unknown>)],
      playlistId,
      traverse_obj(entry, ['title']) as string | undefined,
      traverse_obj(entry, ['description']) as string | undefined,
    );
  }
}
