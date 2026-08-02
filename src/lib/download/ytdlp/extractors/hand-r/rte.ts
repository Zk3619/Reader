/** Rte* — ported from yt-dlp rte.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, try_get, unescapeHTML } from '../../utils';
import { parseIso8601 } from './_helpers';

export class RteBaseIE extends InfoExtractor {
  static IE_NAME = 'RteBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RteBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractRte(url: string, itemId: string): Promise<VideoInfo> {
    const endpoints = [
      `https://feeds.rasset.ie/rteavgen/player/playlist?type=iptv&format=json&showId=${itemId}`,
      `http://www.rte.ie/rteavgen/getplaylist/?type=web&format=json&id=${itemId}`,
    ];

    let infoDict: VideoInfo = { id: itemId, title: itemId };
    const formats: Format[] = [];

    for (let num = 0; num < endpoints.length; num++) {
      let data: Record<string, unknown>;
      try {
        data = await this._download_json<Record<string, unknown>>(endpoints[num]!, itemId);
      } catch (e) {
        if (num < endpoints.length - 1 || formats.length) continue;
        throw e;
      }

      const show = try_get(data, (x) => (x.shows as Array<Record<string, unknown>>)[0]) as Record<string, unknown> | undefined;
      if (!show) continue;

      if (!infoDict.title || infoDict.title === itemId) {
        infoDict = {
          id: itemId,
          title: unescapeHTML(show.title as string),
          description: unescapeHTML(show.description as string) || undefined,
          thumbnail: show.thumbnail as string | undefined,
          timestamp: parseIso8601(show.published as string) ?? undefined,
          duration: float_or_none(show.duration, 1000) ?? undefined,
        };
      }

      const mg = try_get(show, (x) => (x['media:group'] as Array<Record<string, unknown>>)[0]) as
        | Record<string, unknown>
        | undefined;
      if (!mg) continue;

      const mgUrl = mg.url as string | undefined;
      if (mgUrl) {
        const rtmpMatch = mgUrl.match(/(?<url>rtmpe?:\/\/[^/]+)\/(?<app>.+)\/(?<playpath>mp4:.*)/);
        if (rtmpMatch?.groups) {
          formats.push({
            url: `${rtmpMatch.groups.url}/${rtmpMatch.groups.app}`,
            app: rtmpMatch.groups.app,
            play_path: rtmpMatch.groups.playpath,
            player_url: url,
            ext: 'flv',
            format_id: 'rtmp',
          });
        }
      }

      if (mg['hls_server'] && mg['hls_url']) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            String(mg['hls_server']) + String(mg['hls_url']),
            itemId,
            'mp4',
            'm3u8_native',
            'hls',
            undefined,
            undefined,
            undefined,
            false,
          )),
        );
      }
    }

    return { ...infoDict, formats };
  }
}

export class RteIE extends RteBaseIE {
  static IE_NAME = 'rte';
  static IE_DESC = 'Raidió Teilifís Éireann TV';
  static _VALID_URL = /https?:\/\/(?:www\.)?rte\.ie\/player\/[^/]{2,3}\/show\/[^/]+\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractRte(url, this._match_id(url));
  }
}

export class RteRadioIE extends RteBaseIE {
  static IE_NAME = 'rte:radio';
  static IE_DESC = 'Raidió Teilifís Éireann radio';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rte\.ie\/radio\/utils\/radioplayer\/rteradioweb\.html#!rii=(?:b?[0-9]*)(?:%3A|:|%5F|_)(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractRte(url, this._match_id(url));
  }
}
