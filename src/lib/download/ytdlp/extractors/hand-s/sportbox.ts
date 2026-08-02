/** SportBoxIE — ported from yt-dlp sportbox.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, js_to_json, merge_dicts } from '../../utils';

export class SportBoxIE extends InfoExtractor {
  static IE_NAME = 'sportbox';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:news\.sportbox|matchtv)\.ru\/vdl\/player(?:\/[^/]+\/|\?.*?\bn?id=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const sourcesRaw = this._search_regex(
      /playerOptions\.sources(?:WithRes)?\s*=\s*(\[.+?\])\s*;\s*\n/s,
      webpage,
      'sources',
    )!;
    const sources = this._parse_json<Array<Record<string, unknown>>>(sourcesRaw, videoId, js_to_json) || [];
    const formats: Format[] = [];
    for (const source of sources) {
      const src = source.src as string | undefined;
      if (!src) continue;
      if (determine_ext(src) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({ url: src, format_id: determine_ext(src) || 'http' });
      }
    }
    const playerRaw =
      this._search_regex(/playerOptions\s*=\s*({.+?})\s*;\s*\n/s, webpage, 'player options', '{}', false) || '{}';
    const player = this._parse_json<Record<string, unknown>>(playerRaw, videoId, js_to_json) || {};
    const mediaId = String(player.mediaId || videoId);
    const info = this._search_json_ld(webpage, mediaId, { fatal: false }) || {};
    const viewCount = int_or_none(
      this._search_regex(/Просмотров\s*:\s*(\d+)/, webpage, 'view count', null, false),
    );
    return merge_dicts(info, {
      id: mediaId,
      title: this._og_search_title(webpage) || mediaId,
      thumbnail: (player.poster as string) || undefined,
      duration: int_or_none(player.duration) ?? undefined,
      view_count: viewCount ?? undefined,
      formats,
    }) as VideoInfo;
  }
}
