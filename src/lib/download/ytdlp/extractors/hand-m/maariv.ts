/** MaarivIE — ported from yt-dlp maariv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, unified_timestamp, url_or_none, traverse_obj } from '../../utils';

function parseResolutionFromUrl(u: string): { width?: number; height?: number } {
  const m = u.match(/(\d+)x(\d+)/) || u.match(/(\d{3,4})[pP]/);
  if (!m) return {};
  return m[2] ? { width: Number(m[1]), height: Number(m[2]) } : { height: Number(m[1]) };
}

export class MaarivIE extends InfoExtractor {
  static IE_NAME = 'maariv.co.il';
  static _VALID_URL =
    /https?:\/\/player\.maariv\.co\.il\/public\/player\.html\?(?:[^#]+&)?media=(?<id>\d+)/;
  static _EMBED_REGEX = [
    /<iframe[^>]+\bsrc=['"](?<url>https?:\/\/player\.maariv\.co\.il\/public\/player\.html\?(?:[^#]+&)?media=(?<id>\d+))/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `https://dal.walla.co.il/media/${videoId}?origin=player.maariv.co.il`,
        videoId,
      )
    ).data;

    const formats: Format[] = [];
    const hlsUrl = url_or_none(traverse_obj(data, ['video', 'url']));
    if (hlsUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    for (const httpFormat of traverse_obj(data, ['video', 'stream_urls'], { expected_type: 'array' }) as unknown[]) {
      const streamUrl = url_or_none(traverse_obj(httpFormat, ['stream_url']));
      if (!streamUrl) continue;
      formats.push({ url: streamUrl, format_id: 'http', ...parseResolutionFromUrl(streamUrl) });
    }

    return {
      id: videoId,
      title: str_or_none((data as Record<string, unknown>).title) ?? undefined,
      duration: int_or_none(traverse_obj(data, ['video', 'duration'])) ?? undefined,
      timestamp: unified_timestamp((data as Record<string, unknown>).upload_date) ?? undefined,
      formats,
    };
  }
}
