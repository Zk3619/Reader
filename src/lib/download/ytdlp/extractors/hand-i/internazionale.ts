/**
 * InternazionaleIE — ported from yt-dlp internazionale.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_timestamp } from '../../utils';

const DATA_RE = /data-(?<attr>[\w-]+)=(["'])(?<value>(?:(?!\2).)+)\2/gi;

function searchDataAttr(webpage: string, attr: string, defaultValue?: string): string | null {
  for (const m of webpage.matchAll(DATA_RE)) {
    if (m.groups?.attr === attr) return m.groups.value ?? null;
  }
  return defaultValue ?? null;
}

export class InternazionaleIE extends InfoExtractor {
  static IE_NAME = 'internazionale';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?internazionale\.it\/video\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const title =
      searchDataAttr(webpage, 'video-title') ||
      this._og_search_title(webpage) ||
      displayId;

    const videoId = searchDataAttr(webpage, 'job-id');
    const videoPath = searchDataAttr(webpage, 'video-path');
    if (!videoId || !videoPath) {
      throw new ExtractorError('Unable to extract video id or path', { expected: true });
    }

    const abroadRaw = searchDataAttr(webpage, 'video-available_abroad', '1');
    const videoAvailableAbroad = abroadRaw === '1';
    const videoBase = `https://video${videoAvailableAbroad ? '' : '-ita'}.internazionale.it/${videoPath}/${videoId}.`;

    const formats = [
      ...(await this._extract_m3u8_formats(
        `${videoBase}m3u8`,
        displayId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      )),
      ...(await this._extract_mpd_formats(`${videoBase}mpd`, displayId, 'dash', undefined, false)),
    ];

    const timestamp = unified_timestamp(
      this._html_search_meta('article:published_time', webpage, 'timestamp', false),
    );

    return {
      id: videoId,
      display_id: displayId,
      title,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      timestamp: timestamp ?? undefined,
      formats,
    };
  }
}
