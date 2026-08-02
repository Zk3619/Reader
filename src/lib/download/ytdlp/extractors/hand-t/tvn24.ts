/**
 * TVN24IE — ported from yt-dlp tvn24.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unescapeHTML } from '../../utils';

export class TVN24IE extends InfoExtractor {
  static IE_NAME = 'tvn24';
  static _VALID_URL =
    /https?:\/\/(?:(?!eurosport)[^/]+\.)?tvn24(?:bis)?\.pl\/(?:[^/?#]+\/)*(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const title =
      this._og_search_title(webpage, false) ||
      this._search_regex(
        /<h\d+[^>]+class=["']magazineItemHeader[^>]+>(.+?)<\//,
        webpage,
        'title',
        null,
        false,
      ) ||
      displayId;

    const extractJson = (attr: string, name: string, fatal = true): Record<string, unknown> | null => {
      const raw =
        this._search_regex(
          new RegExp(`\\b${attr}=(["'])(?!\\1)(.+?)\\1`),
          webpage,
          name,
          null,
          fatal,
          2,
        ) || '{}';
      return this._parse_json<Record<string, unknown>>(raw, displayId, unescapeHTML, fatal);
    };

    const qualityData = extractJson('data-quality', 'formats') || {};
    const formats: Format[] = [];
    for (const [formatId, formatUrl] of Object.entries(qualityData)) {
      if (typeof formatUrl !== 'string') continue;
      formats.push({
        url: formatUrl,
        format_id: formatId,
        height: int_or_none(formatId.replace(/p$/i, '')) ?? undefined,
      });
    }

    const shareParams = extractJson('data-share-params', 'share params', false);
    let videoId: string | null = null;
    if (shareParams && typeof shareParams === 'object' && shareParams.id != null) {
      videoId = String(shareParams.id);
    }
    if (!videoId) {
      videoId =
        this._search_regex(/data-vid-id=["'](\d+)/, webpage, 'video id', null, false, 1) ||
        this._search_regex(/,(\d+)\.html/, url, 'video id', null, false, 1) ||
        displayId;
    }

    return {
      id: videoId,
      title,
      description: this._og_search_description(webpage) || undefined,
      thumbnail:
        this._og_search_thumbnail(webpage) ||
        this._html_search_regex(/\bdata-poster=(["'])(?!\1)(.+?)\1/, webpage, 'thumbnail', null, false, 2) ||
        undefined,
      formats,
    };
  }
}
