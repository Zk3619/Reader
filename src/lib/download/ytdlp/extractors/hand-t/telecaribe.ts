/** TelecaribePlayIE — ported from yt-dlp telecaribe.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class TelecaribePlayIE extends InfoExtractor {
  static IE_NAME = 'telecaribeplay';
  static _VALID_URL = /https?:\/\/(?:www\.)?play\.telecaribe\.co\/(?<id>[\w-]+)/;

  protected _getCleanTitle(title: string | null | undefined): string | undefined {
    return title?.replace(/\s*\|\s*Telecaribe\s*VOD/, '').trim() || undefined;
  }

  protected async _downloadPlayerWebpage(webpage: string, displayId: string): Promise<string> {
    const pageId =
      this._search_regex(
        [/(?:window\.firstPageId\s*=\s*["'])([^"']+)/, /<div[^>]+id\s*=\s*"pageBackground_([^"]+)"/],
        webpage,
        'page_id',
      ) || '';
    const propsUrl = this._search_regex(
      new RegExp(`<link[^>]+href\\s*=\\s*"([^"]+)"[^>]+id\\s*=\\s*"features_${pageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      webpage,
      'json_props_url',
    );
    const props = (await this._download_json<{ props?: { render?: { compProps?: Record<string, unknown> } } }>(propsUrl!, displayId))
      .props?.render?.compProps;
    const urls = Object.values(props || {})
      .map((v) => (v as { url?: string })?.url)
      .filter(Boolean) as string[];
    return this._download_webpage(urls[urls.length - 1]!, displayId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const player = await this._downloadPlayerWebpage(webpage, displayId);
    const livestreamUrl = this._search_regex(
      /(?:let|const|var)\s+source\s*=\s*["']([^"']+)/,
      player,
      'm3u8 url',
      null,
      false,
    );

    const pageTitle = this._getCleanTitle(this._og_search_title(webpage, false));
    if (!livestreamUrl) {
      const mp4s = [...player.matchAll(/<a[^>]+href\s*=\s*"([^"]+\.mp4)/g)].map((m) => m[1]!);
      return this.playlist_result(
        mp4s.map((u, i) => ({ id: `${displayId}-${i}`, url: u, title: pageTitle })),
        displayId,
        pageTitle,
      );
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, livestreamUrl, displayId, 'hls');
    return {
      id: displayId,
      title: pageTitle,
      formats: formats.map((f) => ({ ...f, is_live: true })),
      subtitles,
      is_live: true,
    };
  }
}
