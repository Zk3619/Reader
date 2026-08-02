/**
 * DHMIE — ported from yt-dlp dhm.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration } from '../../utils';
import { urljoin } from './_helpers';

export class DHMIE extends InfoExtractor {
  static IE_NAME = 'dhm';
  static IE_DESC = 'Filmarchiv - Deutsches Historisches Museum';
  static _VALID_URL = /https?:\/\/(?:www\.)?dhm\.de\/filmarchiv\/(?:[^/]+\/)+(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const playlistUrl = this._search_regex(/file\s*:\s*'([^']+)'/, webpage, 'playlist url')!;
    const playlistXml = await this._download_webpage(urljoin(url, playlistUrl), playlistId);

    const entries: VideoInfo[] = [];
    for (const trackMatch of playlistXml.matchAll(/<track\b[^>]*>([\s\S]*?)<\/track>/gi)) {
      const body = trackMatch[1] || '';
      const loc = body.match(/<location>([^<]+)<\/location>/i)?.[1];
      const title = body.match(/<title>([^<]+)<\/title>/i)?.[1];
      if (!loc) continue;
      entries.push({
        id: loc.split('/').pop()?.replace(/\.[^.]+$/, '') || playlistId,
        title: title || playlistId,
        url: urljoin(playlistUrl, loc),
      });
    }

    const title =
      this._search_regex(
        [/dc:title="([^"]+)"/, /<title> &raquo;([^<]+)<\/title>/],
        webpage,
        'title',
      )?.trim() || playlistId;
    const description =
      this._html_search_regex(
        /<p><strong>Description:<\/strong>(.+?)<\/p>/,
        webpage,
        'description',
        null,
        false,
      ) ?? undefined;
    const duration = parse_duration(
      this._search_regex(/<em>Length\s*<\/em>\s*:\s*<\/strong>([^<]+)/, webpage, 'duration', null, false),
    );

    if (entries[0]) {
      entries[0] = { ...entries[0], title, description, duration: duration ?? undefined };
    }

    return this.playlist_result(entries, playlistId);
  }
}
