/**
 * AlphaPornoIE — aligned with yt-dlp alphaporno.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  int_or_none,
  parse_duration,
  parse_filesize,
} from '../../utils';

function parseIso8601(dateStr: unknown): number | null {
  if (dateStr == null) return null;
  const t = Date.parse(String(dateStr));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

function rtaSearch(html: string): number | undefined {
  if (
    /<meta\s+name="rating"\s+content="RTA-5042-1996-1400-1577-RTA"/i.test(html)
  ) {
    return 18;
  }
  const markers = [
    /Proudly Labeled <a href="http:\/\/www\.rtalabel\.org\/" title="Restricted to Adults">RTA<\/a>/i,
    />[^<]*you acknowledge you are at least (\d+) years old/i,
    />\s*(?:18\s+U(?:\.S\.C\.|SC)\s+)?(?:§+\s*)?2257\b/i,
  ];
  for (const marker of markers) {
    const m = html.match(marker);
    if (m) {
      if (m[1]) return int_or_none(m[1]) ?? 18;
      return 18;
    }
  }
  return undefined;
}

export class AlphaPornoIE extends InfoExtractor {
  static IE_NAME = 'alphaporno';
  static _VALID_URL = /https?:\/\/(?:www\.)?alphaporno\.com\/videos\/(?<id>[^/]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const videoId =
      this._search_regex(/video_id\s*:\s*'([^']+)'/, webpage, 'video id', null, false) ||
      displayId;
    const videoUrl = this._search_regex(/video_url\s*:\s*'([^']+)'/, webpage, 'video url');
    if (!videoUrl) throw new Error('Unable to extract video url');

    const encodingFormat =
      this._html_search_meta('encodingFormat', webpage, 'ext', false) || '.mp4';
    const ext = encodingFormat.startsWith('.') ? encodingFormat.slice(1) : encodingFormat;

    const title =
      this._search_regex(
        [
          /<meta content="([^"]+)" itemprop="description">/,
          /class="title" itemprop="name">([^<]+)</,
        ],
        webpage,
        'title',
      ) || displayId;

    const thumbnail = this._html_search_meta('thumbnail', webpage, 'thumbnail', false);
    const timestamp = parseIso8601(
      this._html_search_meta('uploadDate', webpage, 'upload date', false),
    );
    const duration = parse_duration(
      this._html_search_meta('duration', webpage, 'duration', false),
    );
    const filesizeApprox = parse_filesize(
      this._html_search_meta('contentSize', webpage, 'file size', false),
    );
    const bitrate = int_or_none(this._html_search_meta('bitrate', webpage, 'bitrate', false));
    const keywords =
      this._html_search_meta('keywords', webpage, 'categories', false) || '';
    const categories = keywords.split(',').map((c) => c.trim()).filter(Boolean);

    return {
      id: videoId,
      display_id: displayId,
      url: videoUrl,
      ext,
      title,
      thumbnail: thumbnail || undefined,
      timestamp,
      duration,
      filesize_approx: filesizeApprox,
      tbr: bitrate,
      categories: categories.length ? categories : undefined,
      age_limit: rtaSearch(webpage),
      webpage_url: url,
      original_url: url,
      extractor: 'alphaporno',
      extractor_key: 'AlphaPorno',
    };
  }
}
