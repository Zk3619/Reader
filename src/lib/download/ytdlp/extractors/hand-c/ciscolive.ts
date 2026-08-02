/**
 * CiscoLive family — ported from yt-dlp ciscolive.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, float_or_none, int_or_none, parse_qs, try_get } from '../../utils';
import { urlencodePostdata } from './_helpers';

export class CiscoLiveBaseIE extends InfoExtractor {
  static IE_NAME = 'ciscolivebase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected static RAINFOCUS_API_URL = 'https://events.rainfocus.com/api/%s';
  protected static RAINFOCUS_API_PROFILE_ID = 'Na3vqYdAlJFSxhYTYQGuMbpafMqftalz';
  protected static RAINFOCUS_WIDGET_ID = 'n6l4Lo05R8fiy3RpUBm447dZN8uNWoye';
  protected static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/5647924234001/SyK2FdqjM_default/index.html?videoId=%s';

  protected static HEADERS: Record<string, string> = {
    Origin: 'https://ciscolive.cisco.com',
    rfApiProfileId: 'Na3vqYdAlJFSxhYTYQGuMbpafMqftalz',
    rfWidgetId: 'n6l4Lo05R8fiy3RpUBm447dZN8uNWoye',
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CiscoLiveBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    ep: string,
    rfId: string | null,
    query: Record<string, string | number>,
    referrer: string,
    note?: string,
  ): Promise<Record<string, unknown>> {
    const headers = { ...CiscoLiveBaseIE.HEADERS, Referer: referrer };
    return this._download_json<Record<string, unknown>>(
      CiscoLiveBaseIE.RAINFOCUS_API_URL.replace('%s', ep),
      rfId || undefined,
      note,
      {
        data: urlencodePostdata(query),
        headers,
        method: 'POST',
      },
    );
  }

  protected _parseRfItem(rfItem: Record<string, unknown>): VideoInfo {
    const eventName = rfItem.eventName as string | undefined;
    const title = String(rfItem.title ?? '');
    const description = clean_html(rfItem.abstract as string | undefined);
    const presenterName = try_get(rfItem, (x) => x.participants[0].fullName) as string | undefined;
    const videos = (rfItem.videos as Array<Record<string, unknown>>) || [];
    const bcId = String(videos[0]?.url ?? '');
    const bcUrl = CiscoLiveBaseIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', bcId);
    let duration = float_or_none(try_get(rfItem, (x) => x.times[0].length)) ?? undefined;
    const location = try_get(rfItem, (x) => x.times[0].room) as string | undefined;

    if (duration != null) duration *= 60;

    return {
      _type: 'url_transparent',
      id: bcId,
      url: bcUrl,
      ie_key: 'BrightcoveNew',
      title,
      description: description ?? undefined,
      duration,
      creator: presenterName,
      location,
      series: eventName,
    };
  }
}

export class CiscoLiveSessionIE extends CiscoLiveBaseIE {
  static IE_NAME = 'CiscoLiveSession';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ciscolive(?:\.cisco)?\.com\/[^#]*#\/session\/(?<id>[^/?&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const rfId = this._match_id(url);
    const rfResult = await this._callApi('session', rfId, { id: rfId }, url);
    const items = (rfResult.items as Array<Record<string, unknown>>) || [];
    return this._parseRfItem(items[0]!);
  }
}

export class CiscoLiveSearchIE extends CiscoLiveBaseIE {
  static IE_NAME = 'CiscoLiveSearch';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ciscolive(?:\.cisco)?\.com\/(?:global\/)?on-demand-library(?:\.html|\/)/;

  static suitable(url: string): boolean {
    if (CiscoLiveSessionIE.suitable(url)) return false;
    return super.suitable(url);
  }

  private static _checkBcIdExists(rfItem: Record<string, unknown>): boolean {
    return int_or_none(try_get(rfItem, (x) => x.videos[0].url)) != null;
  }

  private async _entries(query: Record<string, string | number>, url: string): Promise<VideoInfo[]> {
    const q = { ...query, size: 50, from: 0 };
    const entries: VideoInfo[] = [];

    for (let pageNum = 1; ; pageNum++) {
      let results = await this._callApi('search', null, q, url, `Downloading search JSON page ${pageNum}`);
      const sectionList = try_get(results, (x) => x.sectionList[0]) as Record<string, unknown> | null;
      if (sectionList) results = sectionList;

      const items = results.items;
      if (!items || !Array.isArray(items)) break;

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        if (!CiscoLiveSearchIE._checkBcIdExists(item as Record<string, unknown>)) continue;
        entries.push(this._parseRfItem(item as Record<string, unknown>));
      }

      const size = int_or_none(results.size);
      if (size != null) q.size = size;
      const total = int_or_none(results.total);
      if (total != null && q.from + q.size > total) break;
      q.from += q.size;
    }

    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(url.split('#')[0]!);
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(qs)) {
      query[k] = v[0] ?? '';
    }
    query.type = 'session';
    return this.playlist_result(await this._entries(query, url), undefined, 'Search query');
  }
}
