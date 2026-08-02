/**
 * HypemIE — ported from yt-dlp hypem.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class HypemIE extends InfoExtractor {
  static IE_NAME = 'hypem';
  static _VALID_URL = /https?:\/\/(?:www\.)?hypem\.com\/track\/(?<id>[0-9a-z]{5})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const trackId = this._match_id(url);
    const response = await this._download_webpage(url, trackId);

    const tracksRaw = this._html_search_regex(
      /<script\s+type="application\/json"\s+id="displayList-data">([\s\S]*?)<\/script>/,
      response,
      'tracks',
    );
    const parsed = this._parse_json<{ tracks?: Array<Record<string, unknown>> }>(tracksRaw, trackId);
    const track = (parsed?.tracks || [])[0] as Record<string, unknown> | undefined;
    if (!track) throw new Error('Unable to extract track metadata');

    const resolvedId = String(track.id ?? trackId);
    const title = String(track.song ?? trackId);
    const finalUrl = (
      await this._download_json<{ url?: string }>(
        `http://hypem.com/serve/source/${resolvedId}/${track.key}`,
        trackId,
        'Downloading metadata',
        { headers: { 'Content-Type': 'application/json' } },
      )
    ).url;

    return {
      id: resolvedId,
      url: finalUrl!,
      ext: 'mp3',
      title,
      uploader: (track.artist as string | undefined) ?? undefined,
      duration: int_or_none(track.time) ?? undefined,
      timestamp: int_or_none(track.ts) ?? undefined,
      track: title,
    };
  }
}
