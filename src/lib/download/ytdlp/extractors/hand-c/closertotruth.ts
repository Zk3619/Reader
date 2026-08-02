/**
 * CloserToTruthIE — ported from yt-dlp closertotruth.py
 * Upstream marks this extractor as broken (_WORKING = False).
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { htmlExtractTitle } from './_helpers';

export class CloserToTruthIE extends InfoExtractor {
  static IE_NAME = 'closertotruth';
  static _VALID_URL = /https?:\/\/(?:www\.)?closertotruth\.com\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const partnerId = this._search_regex(
      /<script[^>]+src=["'].*?\b(?:partner_id|p)\/(\d+)/,
      webpage,
      'kaltura partner_id',
    )!;

    const title = htmlExtractTitle(webpage) || displayId;

    const select = this._search_regex(
      /<select[^>]+id="select-version"[^>]*>([\s\S]+?)<\/select>/,
      webpage,
      'select version',
      null,
      false,
    );
    if (select) {
      const seen = new Set<string>();
      const entries: VideoInfo[] = [];
      for (const m of webpage.matchAll(/<option[^>]+value=(["'])(?<id>[0-9a-z_]+)(?:#.+?)?\1[^>]*>(?<title>[^<]+)/g)) {
        const entryId = m.groups!.id!;
        if (seen.has(entryId)) continue;
        seen.add(entryId);
        entries.push(this.url_result(`kaltura:${partnerId}:${entryId}`, 'Kaltura', undefined, m.groups!.title));
      }
      if (entries.length) return this.playlist_result(entries, displayId, title);
    }

    const entryId = this._search_regex(
      /<a[^>]+id=(["'])embed-kaltura\1[^>]+data-kaltura=(["'])(?<id>[0-9a-z_]+)\2/,
      webpage,
      'kaltura entry_id',
      undefined,
      true,
      'id',
    )!;

    return {
      ...this.url_result(`kaltura:${partnerId}:${entryId}`, 'Kaltura', undefined, title),
      display_id: displayId,
    };
  }
}
