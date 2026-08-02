/**
 * LiveJournalIE — ported from yt-dlp livejournal.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class LiveJournalIE extends InfoExtractor {
  static IE_NAME = 'livejournal';
  static _VALID_URL = /https?:\/\/(?:[^.]+\.)?livejournal\.com\/video\/album\/\d+.+?\bid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageData = this._parse_json<{ video?: { record?: Record<string, unknown> } }>(
      this._search_regex(/Site\.page\s*=\s*({.+?});/, webpage, 'page data')!,
      videoId,
    );
    const record = pageData?.video?.record || {};
    const storageId = String(record.storageid ?? '');
    let title = record.name != null ? String(record.name) : undefined;
    if (title?.includes('.')) {
      title = title.split('.').slice(0, -1).join('.');
    }

    return {
      _type: 'url_transparent',
      id: videoId,
      title,
      thumbnail: record.thumbnail ? String(record.thumbnail) : undefined,
      timestamp: int_or_none(record.timecreate) ?? undefined,
      url: `eagleplatform:vc.videos.livejournal.com:${storageId}`,
      ie_key: 'EaglePlatform',
    };
  }
}
