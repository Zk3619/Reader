/**
 * MojevideoIE — ported from yt-dlp mojevideo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, remove_end, update_url_query } from '../../utils';
import { htmlExtractTitle } from './_helpers';

const QUALITY_SUFFIXES: Array<[string, number, string]> = [
  ['', 1, 'normálna kvalita'],
  ['_lq', 0, 'nízka kvalita'],
  ['_hd', 2, 'HD-720p'],
  ['_fhd', 3, 'FULL HD-1080p'],
  ['_2k', 4, '2K-1440p'],
];

export class MojevideoIE extends InfoExtractor {
  static IE_NAME = 'mojevideo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?mojevideo\.sk\/video\/(?<id>\w+)\/(?<display_id>[\w()]+?)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id ?? '';
    const webpage = await this._download_webpage(url, videoId);

    const videoIdDec =
      this._search_regex(/\bvId\s*=\s*(\d+)/, webpage, 'video id', null, false) ||
      String(parseInt(videoId, 16));
    const videoExp = this._search_regex(/\bvEx\s*=\s*["'](\d+)/, webpage, 'video expiry');
    const videoHashes = this._search_json<string[]>(
      /\bvHash\s*=/,
      webpage,
      'video hashes',
      videoId,
      { transform_source: js_to_json },
    )!;

    const formats: Format[] = [];
    for (let i = 0; i < videoHashes.length; i++) {
      const [suffix, quality, formatNote] = QUALITY_SUFFIXES[i] || ['', i, `q${i}`];
      formats.push({
        format_id: `mp4-${quality}`,
        quality,
        format_note: formatNote,
        url: update_url_query(
          `https://cache01.mojevideo.sk/securevideos69/${videoIdDec}${suffix}.mp4`,
          { md5: videoHashes[i], expires: videoExp },
        ),
      });
    }

    const ld = this._search_json_ld(webpage, videoId, { fatal: false });

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title:
        this._og_search_title(webpage) ||
        remove_end(htmlExtractTitle(webpage) || '', ' - Mojevideo') ||
        undefined,
      description: this._og_search_description(webpage) || undefined,
      duration: ld.duration as number | undefined,
      timestamp: ld.uploadDate ? Date.parse(String(ld.uploadDate)) / 1000 : undefined,
    };
  }
}
