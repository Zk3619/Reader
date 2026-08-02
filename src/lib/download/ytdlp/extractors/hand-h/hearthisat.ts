/**
 * HearThisAtIE — ported from yt-dlp hearthisat.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, str_to_int } from '../../utils';
import { KNOWN_MEDIA_EXTENSIONS } from '../hand-a/helpers';

export class HearThisAtIE extends InfoExtractor {
  static IE_NAME = 'hearthisat';
  static _VALID_URL = /https?:\/\/(?:www\.)?hearthis\.at\/(?<artist>[^/?#]+)\/(?<title>[\w.-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const artist = m.groups!.artist!;
    const trackSlug = m.groups!.title!;
    const displayId = `${artist} - ${trackSlug}`;

    const apiUrl = url.replace('www.', '').replace('hearthis.at', 'api-v2.hearthis.at');
    const dataJson = await this._download_json<Record<string, unknown>>(apiUrl, displayId);

    const trackId = dataJson.id;
    const artistJson = (dataJson.user as Record<string, unknown>) || {};
    const title = `${artistJson.username ?? artist} - ${dataJson.title ?? trackSlug}`;
    const genre = dataJson.genre as string | undefined;
    const description = dataJson.description as string | undefined;
    const thumbnail = (dataJson.artwork_url as string | undefined) || (dataJson.thumb as string | undefined);
    const viewCount = str_to_int(dataJson.playback_count);
    const duration = str_to_int(dataJson.duration);
    const timestamp = dataJson.release_timestamp as number | undefined;

    const formats: Format[] = [];
    const mp3Url = dataJson.stream_url as string | undefined;
    if (mp3Url) {
      formats.push({
        format_id: 'mp3',
        vcodec: 'none',
        acodec: 'mp3',
        url: mp3Url,
        ext: 'mp3',
      });
    }

    if (dataJson.download_url) {
      const downloadUrl = String(dataJson.download_url);
      const ext = determine_ext(String(dataJson.download_filename ?? ''));
      if (KNOWN_MEDIA_EXTENSIONS.has(ext)) {
        formats.push({
          format_id: ext,
          vcodec: 'none',
          ext,
          url: downloadUrl,
          acodec: ext,
          quality: 2,
        });
      }
    }

    return {
      id: String(trackId ?? displayId),
      display_id: displayId,
      title: String(title),
      formats,
      thumbnail,
      description,
      duration: duration ?? undefined,
      timestamp,
      view_count: viewCount ?? undefined,
      genre: genre as string | undefined,
    };
  }
}
