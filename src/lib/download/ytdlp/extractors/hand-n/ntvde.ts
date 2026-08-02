/** NTVDeIE — ported from yt-dlp ntvde.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';

function jsToJson(s: string): string {
  return s
    .replace(/(\w+):/g, '"$1":')
    .replace(/'/g, '"')
    .replace(/,\s*}/g, '}');
}

export class NTVDeIE extends InfoExtractor {
  static IE_NAME = 'n-tv.de';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?n-tv\.de\/mediathek\/(?:videos|magazine)\/[^/?#]+\/[^/?#]+-article(?<id>[^/?#]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const infoRaw = this._search_regex(/article:\s*(\{[\s\S]*?\})\s*,/, webpage, 'info', null, false, 1);
    const info = (infoRaw ? this._parse_json<Record<string, unknown>>(jsToJson(infoRaw), videoId) : {}) || {};

    const playerRaw = this._search_regex(
      /\$\(\s*"#playerwrapper"\s*\)\s*\.data\(\s*"player",\s*(\{[\s\S]*?\})\s*\)/,
      webpage,
      'player data',
    )!;
    const playerData = this._parse_json<{ setup?: { source?: Record<string, unknown> } }>(
      jsToJson(playerRaw.replace(/ivw:[^},]+/g, '')),
      videoId,
    )!;
    const vdata = playerData.setup?.source || {};

    const formats: Format[] = [];
    if (vdata.progressive) formats.push({ format_id: 'http', url: String(vdata.progressive) });
    if (vdata.hls) {
      formats.push(
        ...(await this._extract_m3u8_formats(String(vdata.hls), videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    if (vdata.dash) {
      formats.push(...(await this._extract_mpd_formats(String(vdata.dash), videoId, 'dash', undefined, false)));
    }

    return {
      id: videoId,
      title: str_or_none(info.headline) ?? undefined,
      description: str_or_none(info.intro) ?? undefined,
      alt_title: str_or_none(info.kicker) ?? undefined,
      timestamp: int_or_none(info.publishedDateAsUnixTimeStamp) ?? undefined,
      thumbnail: url_or_none(vdata.poster) ?? undefined,
      duration: int_or_none(vdata.length) ?? undefined,
      formats,
    };
  }
}
