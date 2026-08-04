// @ts-nocheck
/** UlizaPlayerIE / UlizaPortalIE â€?ported from yt-dlp uliza.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_qs, traverse_obj } from '../../utils';
import { htmlExtractTitle, make_archive_id } from './_helpers';

export class UlizaPlayerIE extends InfoExtractor {
  static IE_NAME = 'ulizaplayer';
  static _VALID_URL =
    /https:\/\/player-api\.p\.uliza\.jp\/v1\/players\/[^?#]+\?(?:[^#]*&)?name=(?<id>[^#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const playerData = await this._download_webpage(
      url,
      displayId,
      'Fetching player data',
      {
        headers: { Referer: 'https://player-api.p.uliza.jp/' },
      },
    );

    const m3u8Url = this._search_regex(
      /["'](https:\/\/vms-api\.p\.uliza\.jp\/v1\/prog-index\.m3u8[^"']+)/,
      playerData,
      'm3u8 url',
    )!;
    const videoId = parse_qs(m3u8Url).ss?.[0] || displayId;

    const formats = await this._extract_m3u8_formats(m3u8Url, videoId);
    const m3u8Type = this._search_regex(
      /\/hls\/(dvr|video)\//,
      String(traverse_obj(formats, [0, 'url']) || ''),
      'm3u8 type',
      null,
      false,
    );
    const liveStatus =
      m3u8Type === 'video' ? 'is_live' : m3u8Type === 'dvr' ? 'was_live' : 'not_live';

    return {
      id: videoId,
      title: videoId,
      formats,
      live_status: liveStatus,
      _old_archive_ids: [make_archive_id('PIAULIZAPortal', videoId)],
    };
  }
}

export class UlizaPortalIE extends InfoExtractor {
  static IE_NAME = 'ulizaportal';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ulizaportal\.jp\/pages\/(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const expires = int_or_none(traverse_obj(parse_qs(url), ['expires', 0]));
    if (expires != null && expires <= Math.floor(Date.now() / 1000)) {
      throw new ExtractorError('The link is expired', { expected: true });
    }

    const webpage = await this._download_webpage(url, videoId);
    const playerDataUrl = this._search_regex(
      /<script [^>]*\bsrc="(https:\/\/player-api\.p\.uliza\.jp\/v1\/players\/[^"]+)"/,
      webpage,
      'player data url',
    )!;

    return {
      ...this.url_result(playerDataUrl, 'UlizaPlayer', videoId, htmlExtractTitle(webpage) || undefined),
      _type: 'url_transparent',
      display_id: videoId,
    };
  }
}
