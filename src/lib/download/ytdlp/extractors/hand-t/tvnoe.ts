/**
 * TVNoeIE — ported from yt-dlp tvnoe.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  js_to_json,
  mimetype2ext,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

export class TVNoeIE extends InfoExtractor {
  static IE_NAME = 'tvnoe';
  static IE_DESC = 'Televize Noe';

  static _VALID_URL = /https?:\/\/(?:www\.)?tvnoe\.cz\/porad\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const player = this._parse_json<Record<string, unknown>>(
      this._search_regex(/var\s+INIT_PLAYER\s*=/, webpage, 'init player')!,
      videoId,
      js_to_json,
    );
    if (!player) throw new ExtractorError('TV Noe player config missing', { expected: true });

    const formats: Format[] = [];
    const tracks = player.tracks;
    if (Array.isArray(tracks)) {
      for (const source of tracks) {
        if (!source || typeof source !== 'object') continue;
        const rec = source as Record<string, unknown>;
        const srcUrl = url_or_none(rec.src);
        if (!srcUrl) continue;
        const ext = mimetype2ext(rec.type != null ? String(rec.type) : undefined);
        if (ext === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(srcUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else if (ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(srcUrl, videoId, 'dash', undefined, false)));
        }
      }
    }

    const h2Match = webpage.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const h1Match = webpage.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const premiereMatch = (clean_html(webpage) || '').match(/Premiéra:\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
    const playerEl = webpage.match(/<[^>]+id=["']player-live["'][^>]*>/i);
    let thumbnail: string | undefined;
    if (playerEl) {
      const attrs = extract_attributes(playerEl[0]!);
      const poster = attrs.poster;
      if (poster) thumbnail = urljoin('https://www.tvnoe.cz/', poster);
    }

    return {
      id: videoId,
      title: h2Match ? clean_html(h2Match[1]!) || undefined : undefined,
      description:
        clean_html(
          this._search_regex(/<p\s+class="">(.+?)<\/p>/, webpage, 'description', null, false) || '',
        ) || undefined,
      release_date: premiereMatch ? unified_strdate(premiereMatch[1]!) ?? undefined : undefined,
      series: h1Match ? clean_html(h1Match[1]!) || undefined : undefined,
      thumbnail,
      formats,
    };
  }
}
