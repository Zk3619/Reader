/** ReutersIE — ported from yt-dlp reuters.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, js_to_json, unescapeHTML } from '../../utils';

export class ReutersIE extends InfoExtractor {
  static IE_NAME = 'Reuters';
  static _VALID_URL = /https?:\/\/(?:www\.)?reuters\.com\/.*?\?.*?videoId=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `http://www.reuters.com/assets/iframe/yovideo?videoId=${videoId}`,
      videoId,
    );
    const videoDataRaw = this._search_regex(
      /Reuters\.yovideo\.drawPlayer\((\{[\s\S]*?\})\);/,
      webpage,
      'video data',
    );
    const videoData = js_to_json(videoDataRaw!);

    const getJsonValue = (key: string, fatal = false): string | null =>
      this._search_regex(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`), videoData, key, null, fatal);

    const title = unescapeHTML(getJsonValue('title', true)!);
    const flvVal = getJsonValue('flv', true)!;
    const flvMatch = /,\/(\d+)\?f=(\d+)/.exec(flvVal);
    if (!flvMatch) throw new Error('Unable to parse flv');
    const [, mmid, fid] = flvMatch;

    const masText = await this._download_webpage(
      `http://mas-e.cds1.yospace.com/mas/${mmid}/${fid}?trans=json`,
      videoId,
    );
    const masData = this._parse_json(js_to_json(masText), videoId) as Array<Record<string, unknown>>;

    const formats: Format[] = [];
    for (const f of masData) {
      const fUrl = f.url as string | undefined;
      if (!fUrl) continue;
      const method = f.method as string | undefined;
      if (method === 'hls') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            fUrl,
            videoId,
            'mp4',
            'm3u8_native',
            'hls',
            undefined,
            undefined,
            undefined,
            false,
          )),
        );
      } else {
        const container = f.container as string | undefined;
        const ext = method === 'mobile' ? '3gp' : container || 'mp4';
        formats.push({
          format_id: ext,
          url: fUrl,
          ext,
          container: method !== 'mobile' ? container : undefined,
        });
      }
    }

    return {
      id: videoId,
      title,
      thumbnail: getJsonValue('thumb') ?? undefined,
      duration: int_or_none(getJsonValue('seconds')) ?? undefined,
      formats,
    };
  }
}
