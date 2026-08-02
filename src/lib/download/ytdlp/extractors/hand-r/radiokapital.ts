/** RadioKapital* — ported from yt-dlp radiokapital.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, traverse_obj, unescapeHTML } from '../../utils';

export class RadioKapitalBaseIE extends InfoExtractor {
  static IE_NAME = 'RadioKapitalBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RadioKapitalBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(resource: string, videoId: string, note = 'Downloading JSON metadata', qs: Record<string, string | number> = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(qs)) params.set(k, String(v));
    const q = params.toString();
    return this._download_json<Record<string, unknown>>(
      `https://www.radiokapital.pl/wp-json/kapital/v1/${resource}${q ? `?${q}` : ''}`,
      videoId,
      note,
    );
  }

  protected _parseEpisode(data: Record<string, unknown>): VideoInfo {
    const published = String(data.published || '');
    const release = `${published.slice(6, 11)}${published.slice(3, 6)}${published.slice(0, 3)}`;
    return {
      _type: 'url_transparent',
      id: String(data.id ?? data.slug ?? ''),
      url: data.mixcloud_url as string,
      ie_key: 'Mixcloud',
      title: unescapeHTML(String(data.title || '')),
      description: clean_html(String(data.content || '')) || undefined,
      tags: traverse_obj(data, ['tags', 'all', 'name']) as string[] | undefined,
      release_date: release,
      series: traverse_obj(data, ['show', 'title']) as string | undefined,
    };
  }
}

export class RadioKapitalIE extends RadioKapitalBaseIE {
  static IE_NAME = 'radiokapital';
  static _VALID_URL = /https?:\/\/(?:www\.)?radiokapital\.pl\/shows\/[a-z\d-]+\/(?<id>[a-z\d-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const episode = await this._callApi(`episodes/${videoId}`, videoId);
    return this._parseEpisode(episode);
  }
}

export class RadioKapitalShowIE extends RadioKapitalBaseIE {
  static IE_NAME = 'radiokapital:show';
  static _VALID_URL = /https?:\/\/(?:www\.)?radiokapital\.pl\/shows\/(?<id>[a-z\d-]+)\/?(?:$|[?#])/;

  protected async _getEpisodeList(seriesId: string, pageNo: number) {
    return this._callApi('episodes', seriesId, `Downloading episode list page #${pageNo}`, {
      show: seriesId,
      page: pageNo,
    }) as Promise<{ items?: Record<string, unknown>[]; next?: unknown }>;
  }

  protected async *_entries(seriesId: string): AsyncGenerator<VideoInfo> {
    for (let pageNo = 1; ; pageNo++) {
      const episodeList = await this._getEpisodeList(seriesId, pageNo);
      for (const ep of episodeList.items || []) {
        yield this._parseEpisode(ep);
      }
      if (episodeList.next == null) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const show = await this._callApi(`shows/${seriesId}`, seriesId, 'Downloading show metadata');
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(seriesId)) entries.push(entry);
    return {
      _type: 'playlist',
      entries,
      id: String(show.id),
      title: show.title as string | undefined,
      description: clean_html(String(show.content || '')) || undefined,
    };
  }
}
