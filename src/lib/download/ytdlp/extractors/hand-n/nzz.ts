/** NZZIE — ported from yt-dlp nzz.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseJwplayerData } from './_helpers';

export class NZZIE extends InfoExtractor {
  static IE_NAME = 'NZZ';
  static _VALID_URL = /https?:\/\/(?:www\.)?nzz\.ch\/(?:[^/]+\/)*[^/?#]+-ld\.(?<id>\d+)/;

  protected async *_entries(webpage: string, pageId: string): AsyncGenerator<VideoInfo> {
    for (const m of webpage.matchAll(/<script[^>]* data-hid="jw-video-jw[^>]+>([\s\S]*?)<\/script>/g)) {
      const script = m[1] || '';
      const settingsMatch = script.match(/var\s+settings\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (!settingsMatch) continue;
      const settings = this._parse_json<unknown>(settingsMatch[1]!, pageId);
      const entry = await parseJwplayerData(this, settings, pageId);
      if (entry.formats?.length) yield entry;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(webpage, pageId)) {
      entries.push(entry);
    }
    return this.playlist_result(entries, pageId);
  }
}
