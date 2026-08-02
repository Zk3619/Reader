/**
 * HytaleIE — ported from yt-dlp hytale.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class HytaleIE extends InfoExtractor {
  static IE_NAME = 'hytale';
  static _VALID_URL = /https?:\/\/(?:www\.)?hytale\.com\/news\/\d+\/\d+\/(?<id>[a-z0-9-]+)/;

  private _titles: Record<string, string> = {};

  protected async _loadClipTitles(): Promise<void> {
    if (Object.keys(this._titles).length) return;
    const mediaWebpage =
      (await this._download_webpage('https://hytale.com/media', undefined, 'Downloading list of media', {
        fatal: false,
      })) || '';
    const stateMatch = mediaWebpage.match(/window\.__INITIAL_COMPONENTS_STATE__\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!stateMatch?.[1]) return;
    try {
      const state = JSON.parse(stateMatch[1]) as Array<{ media?: { clips?: Array<{ src?: string; caption?: string }> } }>;
      for (const block of state) {
        for (const clip of block.media?.clips || []) {
          if (clip.src) this._titles[clip.src] = clip.caption || '';
        }
      }
    } catch {
      /* ignore parse errors */
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    await this._loadClipTitles();
    const webpage = await this._download_webpage(url, playlistId);

    const entries = [...webpage.matchAll(/<stream\s+class\s*=\s*"ql-video\s+cf-stream"\s+src\s*=\s*"([a-f0-9]{32})"/gi)].map(
      (m) => {
        const videoHash = m[1]!;
        return {
          ...this.url_result(
            `https://cloudflarestream.com/${videoHash}/manifest/video.mpd?parentOrigin=https%3A%2F%2Fhytale.com`,
            'CloudflareStream',
            videoHash,
            this._titles[videoHash],
          ),
          _type: 'url_transparent' as const,
        };
      },
    );

    return this.playlist_result(entries, playlistId, this._og_search_title(webpage) ?? undefined);
  }
}
