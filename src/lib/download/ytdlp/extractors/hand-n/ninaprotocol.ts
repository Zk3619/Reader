/** NinaProtocolIE — ported from yt-dlp ninaprotocol.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, mimetype2ext, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class NinaProtocolIE extends InfoExtractor {
  static IE_NAME = 'NinaProtocol';
  static _VALID_URL = /https?:\/\/(?:www\.)?ninaprotocol\.com\/releases\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const resp = await this._download_json<{ release?: Record<string, unknown> }>(
      `https://api.ninaprotocol.com/v1/releases/${slug}`,
      slug,
    );
    const release = resp.release || {};
    const videoId = str_or_none(release.publicKey) || slug;

    const commonInfo: Record<string, unknown> = {
      album: str_or_none(traverse_obj(release, ['metadata', 'properties', 'title'])),
      album_artist: str_or_none(traverse_obj(release, ['hub', 'data', 'publisherAccount', 'displayName'])),
      timestamp: parseIso8601(traverse_obj(release, ['datetime'])),
      thumbnail: url_or_none(traverse_obj(release, ['metadata', 'image'])),
      uploader: str_or_none(traverse_obj(release, ['publisherAccount', 'handle'])),
      uploader_id: str_or_none(traverse_obj(release, ['publisherAccount', 'publicKey'])),
      channel: str_or_none(traverse_obj(release, ['hub', 'handle'])),
      channel_id: str_or_none(traverse_obj(release, ['hub', 'publicKey'])),
      tags: ((traverse_obj(release, ['metadata', 'properties', 'tags']) as string[]) || []).map(String),
    };

    const files = traverse_obj(release, ['metadata', 'properties', 'files']) as Array<Record<string, unknown>> | undefined;
    const entries: VideoInfo[] = [];
    for (const [i, track] of (files || []).filter((f) => url_or_none(f.uri)).entries()) {
      entries.push({
        id: `${videoId}_${i + 1}`,
        url: String(track.uri),
        title: str_or_none(track.track_title) ?? undefined,
        track: str_or_none(track.track_title) ?? undefined,
        ext: mimetype2ext(String(track.type ?? '')) || 'mp3',
        track_number: int_or_none(track.track) ?? undefined,
        duration: int_or_none(track.duration) ?? undefined,
        vcodec: 'none',
        ...commonInfo,
      } as VideoInfo);
    }

    return {
      _type: 'playlist',
      id: videoId,
      entries,
      display_id: str_or_none(release.slug) ?? undefined,
      title: str_or_none(traverse_obj(release, ['metadata', 'name'])) ?? undefined,
      description: str_or_none(traverse_obj(release, ['metadata', 'description'])) ?? undefined,
      ...commonInfo,
    };
  }
}
