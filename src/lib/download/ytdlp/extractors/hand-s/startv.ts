/** StarTVIE — ported from yt-dlp startv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, traverse_obj } from '../../utils';
import { protoRelative } from './_helpers';

export class StarTVIE extends InfoExtractor {
  static IE_NAME = 'startv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?startv\.com\.tr\/(?:(?:dizi|program)\/[^/?#&]+\/(?:bolumler|fragmanlar|ekstralar)|video\/arsiv\/(?:dizi|program)\/[^/?#&]+)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const infoUrl = this._search_regex(
      /(["'])videoUrl\1\s*:\s*\1(?<url>(?:(?!\1).)+)\1\s*/,
      webpage,
      'video info url',
      null,
      false,
      'url',
    )!;
    const payload = await this._download_json<{ data?: Record<string, unknown> }>(infoUrl, displayId);
    const info = payload.data;
    if (!info) throw new ExtractorError('Failed to extract API data', { expected: true });
    const videoId = String(info.id);
    const title = String(info.title || this._og_search_title(webpage) || videoId);
    const description =
      clean_html(String(info.description || '')) || this._og_search_description(webpage) || undefined;
    const thumbnail = protoRelative(this._og_search_thumbnail(webpage) || '') || undefined;
    const hlsUrl = traverse_obj(info, ['flavors', 'hls']) as string | undefined;
    const formats = hlsUrl
      ? await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)
      : [];
    return {
      id: videoId,
      display_id: displayId,
      title,
      description,
      thumbnail,
      timestamp: int_or_none(info.release_date) ?? undefined,
      formats,
    };
  }
}
