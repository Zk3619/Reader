/**
 * FazIE ??ported from yt-dlp faz.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { xmlTagText } from './_helpers';

export class FazIE extends InfoExtractor {
  static IE_NAME = 'faz.net';
  static _VALID_URL = /https?:\/\/(?:www\.)?faz\.net\/(?:[^/]+\/)*.*?-(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const description = this._og_search_description(webpage) ?? undefined;
    const media = this._html_search_regex(/data-videojs-media='([^']+)'/, webpage, 'media')!;

    if (media === 'extern') {
    const performUrl = this._search_regex(
      /<iframe[^>]+?src='((?:http:)?\/\/player\.performgroup\.com\/eplayer\/eplayer\.html#?\/?[0-9a-f]{26}\.[0-9a-z]{26})/,
      webpage,
      'perform url',
    )!;
      return this.url_result(performUrl);
    }

    const formats: Format[] = [];
    for (const [pref, code] of ['LOW', 'HIGH', 'HQ'].entries()) {
      const block = media.match(new RegExp(`<${code}[^>]*>([\\s\\S]*?)<\\/${code}>`, 'i'));
      if (!block) continue;
      const encodingUrl = xmlTagText(block[0], 'FILENAME');
      if (!encodingUrl) continue;
      let tbr = int_or_none((xmlTagText(block[0], 'AVERAGEBITRATE') || '').replace(',', '.'));
      if (tbr) tbr = Math.round(tbr * 1000);
      const f: Format = {
        url: encodingUrl,
        format_id: code.toLowerCase(),
        quality: pref,
        tbr: tbr ?? undefined,
        vcodec: xmlTagText(block[0], 'CODEC') ?? undefined,
      };
      const mobj = /(\d+)x(\d+)_(\d+)\.mp4/.exec(encodingUrl);
      if (mobj) {
        f.width = Number(mobj[1]);
        f.height = Number(mobj[2]);
        f.tbr = tbr ?? Number(mobj[3]);
      }
      formats.push(f);
    }

    return {
      id: videoId,
      title: this._og_search_title(webpage) || videoId,
      formats,
      description: description?.trim() || undefined,
      thumbnail: xmlTagText(media, 'STILL/STILL_BIG') ?? undefined,
      duration: int_or_none(xmlTagText(media, 'DURATION')) ?? undefined,
    };
  }
}
