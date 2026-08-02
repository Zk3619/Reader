/**
 * TV2DKIE / TV2DKBornholmPlayIE — ported from yt-dlp tv2dk.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, js_to_json, url_or_none } from '../../utils';
import { playlistFromMatches } from './_helpers';

export class TV2DKIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:tvsyd|tv2ostjylland|tvmidtvest|tv2fyn|tv2east|tv2lorry|tv2nord|tv2kosmopol)\.dk\/(?:[^/?#]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const articleMatch = webpage.match(/<article[\s\S]*?<\/article>/i);
    const searchSpace = articleMatch?.[0] || webpage;

    const playerIds: string[] = [];
    for (const m of searchSpace.matchAll(/x-data="(?:video_player|simple_player)\(({[^"]+})/g)) {
      try {
        const parsed = this._parse_json<Record<string, unknown>>(m[1]!, videoId, js_to_json);
        if (!parsed) continue;
        const id = parsed.jwpMediaId ?? parsed.videoId;
        if (id != null) playerIds.push(String(id));
      } catch {
        /* skip malformed player blob */
      }
    }

    return playlistFromMatches(
      this,
      playerIds.map((id) => `jwplatform:${id}`),
      videoId,
      { ie: 'JWPlatform' },
    );
  }
}

export class TV2DKBornholmPlayIE extends InfoExtractor {
  static _VALID_URL = /https?:\/\/play\.tv2bornholm\.dk\/\?.*?\bid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const payload = await this._download_json<{ d: string }>(
      'https://play.tv2bornholm.dk/controls/AJAX.aspx/specifikVideo',
      videoId,
      undefined,
      {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        data: JSON.stringify({ playlist_id: videoId, serienavn: '' }),
      },
    );
    const video = payload.d;
    const title =
      this._search_regex(/title\s*:\s*(["'])(?:(?!\1).)+\1/, video, 'title', null, false)?.replace(/^["']|["']$/g, '') ||
      videoId;
    const sources = this._parse_json<Record<string, unknown>[]>(
      this._search_regex(/sources:\s*(\[[\s\S]+?\]),/, video, 'sources')!,
      videoId,
      js_to_json,
    );
    if (!sources) throw new ExtractorError('TV2 Bornholm sources missing', { expected: true });

    const formats: Format[] = [];
    const srcs = new Set<string>();
    for (const source of sources) {
      const src = url_or_none(source.src);
      if (!src || srcs.has(src)) continue;
      srcs.add(src);
      const ext = determine_ext(src);
      const srcType = source.type != null ? String(source.type) : '';
      if (srcType === 'application/x-mpegurl' || ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(src, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (srcType === 'application/dash+xml' || ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(src, videoId, 'dash', undefined, false)));
      } else {
        formats.push({ url: src, format_id: ext || 'http', ext });
      }
    }

    return { id: videoId, title, formats };
  }
}
