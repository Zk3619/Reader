/** Smotrim* IE classes — ported from yt-dlp smotrim.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  get_element_by_class,
  get_elements_by_class,
  int_or_none,
  str_or_none,
  unescapeHTML,
  url_or_none,
  traverse_obj,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parse_iso8601, protoRelative, urljoin } from './_helpers';

export class SmotrimBaseIE extends InfoExtractor {
  static IE_NAME = 'smotrimbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _BASE_URL = 'https://smotrim.ru';
  static _GEO_COUNTRIES = ['RU'];

  protected async _extractFromSmotrimApi(typ: string, itemId: string): Promise<VideoInfo> {
    const path = `data${typ.replace(/-/g, '')}/${typ === 'live' ? 'uid' : 'id'}`;
    const data = await this._download_json<Record<string, unknown>>(
      `https://player.smotrim.ru/iframe/${path}/${itemId}/sid/smotrim`,
      itemId,
    );
    const media = traverse_obj(data, ['data', 'playlist', 'medialist', -1]) as Record<string, unknown> | undefined;
    if (traverse_obj(media, ['locked'])) this.raise_login_required();
    const errorMsg = clean_html(String(traverse_obj(media, ['errors']) || ''));
    if (errorMsg) this.raise_geo_restricted(errorMsg, SmotrimBaseIE._GEO_COUNTRIES);

    const webpageUrl = url_or_none(traverse_obj(data, ['data', 'template', 'share_url']));
    const webpage = webpageUrl ? await this._download_webpage(webpageUrl, itemId) : '';

    const common: Partial<VideoInfo> = {
      thumbnail:
        this._html_search_meta(['og:image', 'twitter:image'], webpage, null, false) || undefined,
      id: str_or_none(media?.id) || undefined,
      title:
        clean_html(String(media?.episodeTitle || media?.title || '')) || undefined,
      channel_id: str_or_none(media?.channelId) || undefined,
      description: clean_html(String(media?.anons || '')) || undefined,
      season: clean_html(String(media?.season || '')) || undefined,
      series: clean_html(String(media?.brand_title || media?.brandTitle || '')) || undefined,
      series_id: str_or_none(media?.brand_id) || undefined,
    };

    let metadata: Partial<VideoInfo> = {};

    if (typ === 'audio') {
      const bookmark = this._search_json<Record<string, unknown>>(
        /class="bookmark"[^>]+value\s*=\s*"/,
        webpage,
        'bookmark',
        itemId,
        { default: {}, transform_source: unescapeHTML },
      );
      metadata = {
        vcodec: 'none',
        ext: determine_ext(String(media?.audio_url || ''), 'mp3') || 'mp3',
        duration: int_or_none(media?.duration) ?? undefined,
        url: url_or_none(media?.audio_url) || undefined,
        title: clean_html(String(bookmark?.subtitle || '')) || common.title,
        timestamp: parse_iso8601(bookmark?.published) ?? undefined,
      };
    } else if (typ === 'audio-live') {
      metadata = {
        ext: 'mp3',
        url: url_or_none(traverse_obj(media, ['source', 'auto'])) || undefined,
        vcodec: 'none',
      };
    } else {
      const formats: Format[] = [];
      let subtitles: Record<string, Subtitle[]> = {};
      for (const m3u8Url of traverse_obj(media, ['sources', 'm3u8']) as Record<string, string> | undefined
        ? Object.values(traverse_obj(media, ['sources', 'm3u8']) as Record<string, string>)
        : []) {
        const u = url_or_none(m3u8Url);
        if (!u) continue;
        const res = await extractM3u8FormatsAndSubtitles(this, u, itemId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
      metadata = { formats, subtitles, ...this._search_json_ld(webpage, itemId, { fatal: false }) };
    }

    const tags = get_elements_by_class('tags-list__link', webpage)
      .map((h) => clean_html(h))
      .filter(Boolean) as string[];

    return {
      age_limit: int_or_none(traverse_obj(data, ['data', 'age_restrictions'])) ?? undefined,
      is_live: typ === 'audio-live' || typ === 'live',
      tags: tags.length ? tags : undefined,
      webpage_url: webpageUrl || undefined,
      ...common,
      ...metadata,
    } as VideoInfo;
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('SmotrimBaseIE is not a standalone extractor');
  }
}

export class SmotrimIE extends SmotrimBaseIE {
  static IE_NAME = 'smotrim';
  static _VALID_URL =
    /(?:https?:)?\/\/(?:(?:player|www)\.)?smotrim\.ru(?:\/iframe)?\/video(?:\/id)?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractFromSmotrimApi('video', this._match_id(url));
  }
}

export class SmotrimAudioIE extends SmotrimBaseIE {
  static IE_NAME = 'smotrim:audio';
  static _VALID_URL =
    /https?:\/\/(?:(?:player|www)\.)?smotrim\.ru(?:\/iframe)?\/audio(?:\/id)?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractFromSmotrimApi('audio', this._match_id(url));
  }
}

export class SmotrimLiveIE extends SmotrimBaseIE {
  static IE_NAME = 'smotrim:live';
  static _VALID_URL =
    /(?:https?:)?\/\/(?:(?:(?:test)?player|www)\.)?(?:smotrim\.ru|vgtrk\.com)(?:\/iframe)?\/(?<type>channel|(?:audio-)?live)(?:\/u?id)?\/(?<id>[\da-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let typ = this._match_valid_url(url)!.groups!.type!;
    let displayId = this._match_valid_url(url)!.groups!.id!;
    let videoId = displayId;

    if (typ === 'live' && /^\d+$/.test(displayId)) {
      const resp = await this._request_webpage(url, displayId);
      const finalUrl = resp?.url || url;
      const m = this._match_valid_url(finalUrl);
      if (m) typ = m.groups!.type!;
    }

    if (typ === 'channel') {
      const webpage = await this._download_webpage(url, displayId);
      let srcUrl: string | undefined;
      const frame = webpage.match(/class=["']main-player__frame["'][^>]*>/i)?.[0];
      if (frame) srcUrl = protoRelative(extract_attributes(frame).src || '');
      if (!srcUrl) {
        const btn = webpage.match(/class=["']audio-play-button["'][^>]*>/i)?.[0];
        if (btn) {
          const val = decodeURIComponent(extract_attributes(btn).value || '');
          try {
            srcUrl = protoRelative(JSON.parse(val).source || '');
          } catch {
            /* ignore */
          }
        }
      }
      if (!srcUrl) throw new Error('Unable to extract src URL');
      const m = srcUrl.match(SmotrimLiveIE._VALID_URL);
      if (!m) throw new Error('Unable to parse src URL');
      typ = m.groups!.type!;
      videoId = m.groups!.id!;
    }

    return { display_id: displayId, ...(await this._extractFromSmotrimApi(typ, videoId)) };
  }
}

export class SmotrimPlaylistIE extends SmotrimBaseIE {
  static IE_NAME = 'smotrim:playlist';
  static _PAGE_SIZE = 15;
  static _VALID_URL = /https?:\/\/smotrim\.ru\/(?<type>brand|podcast)\/(?<id>\d+)\/?(?<season>[\w-]+)?/;

  protected async _fetchPage(
    endpoint: string,
    key: string,
    playlistId: string,
    page: number,
  ): Promise<VideoInfo[]> {
    const items = await this._download_json<Record<string, unknown>>(
      `${SmotrimBaseIE._BASE_URL}/api/${endpoint}`,
      playlistId,
      `Downloading page ${page + 1}`,
      { query: { [key]: playlistId, limit: String(SmotrimPlaylistIE._PAGE_SIZE), page: String(page + 1) } },
    );
    const links =
      (traverse_obj(items, ['contents', -1, 'list']) as Record<string, unknown>[])
        ?.map((x) => String(x.link || ''))
        .filter(Boolean) || [];
    return links.map((link) => this.url_result(urljoin(SmotrimBaseIE._BASE_URL, link)));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistType = m.groups!.type!;
    const playlistId = m.groups!.id!;
    const season = m.groups!.season;
    const key = playlistType === 'podcast' ? 'rubricId' : 'brandId';
    const webpage = await this._download_webpage(url, playlistId);
    const playlistTitle =
      this._html_search_meta(['og:title', 'twitter:title'], webpage, null, false) || undefined;

    if (season) {
      const hrefs = [...webpage.matchAll(/href=["'](\/video\/\d+)["']/gi)].map((x) => x[1]!);
      void (clean_html(get_element_by_class('seasons__item seasons__item--selected', webpage) || '') || undefined);
      return this.playlist_result(
        hrefs.map((h) => this.url_result(urljoin(SmotrimBaseIE._BASE_URL, h))),
        playlistId,
        playlistTitle,
        undefined,
      );
    }

    const endpoint = get_element_by_class('brand-main-item__videos', webpage) ? 'videos' : 'audios';
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const batch = await this._fetchPage(endpoint, key, playlistId, page);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < SmotrimPlaylistIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}
