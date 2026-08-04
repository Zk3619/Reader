// @ts-nocheck
/**
 * VrSquare* â€?ported from yt-dlp vrsquare.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  parse_duration,
  parse_qs,
} from '../../utils';

function findElementsByClass(html: string, cls: string, asHtml = false): string[] {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(asHtml ? m[0]! : m[3] || '');
  }
  // also match self-closing / void-ish video cards with only opening tag attrs
  if (!out.length && cls === 'video') {
    for (const t of html.matchAll(/<[^>]+class=["'][^"']*\bvideo\b[^"']*["'][^>]*>/gi)) {
      out.push(t[0]!);
    }
  }
  return out;
}

function findElementByClass(html: string, cls: string): string | null {
  return findElementsByClass(html, cls)[0] ?? null;
}

export class VrSquareIE extends InfoExtractor {
  static IE_NAME = 'vrsquare';
  static IE_DESC = 'VR SQUARE';
  static _BASE_URL = 'https://livr.jp';
  static _VALID_URL = /https?:\/\/livr\.jp\/contents\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const status = await this._download_json<Record<string, unknown>>(
      `${VrSquareIE._BASE_URL}/webApi/contentsStatus/${videoId}`,
      videoId,
      'Checking contents status',
      { fatal: false },
    );
    if (status?.result_code === '40407') {
      this.raise_login_required('Unable to access this video');
    }

    let webApi: Record<string, unknown>;
    try {
      webApi = await this._download_json<Record<string, unknown>>(
        `${VrSquareIE._BASE_URL}/webApi/play/url/${videoId}`,
        videoId,
      );
    } catch (e) {
      const err = e as Error & { cause?: { status?: number; message?: string } };
      const statusCode = err.cause?.status;
      const msg = String(err.message || err.cause?.message || '');
      if (statusCode === 500 || /\b500\b/.test(msg)) {
        throw new ExtractorError('VR SQUARE app-only videos are not supported', { expected: true });
      }
      throw e;
    }

    const urlList = (webApi.urls as Array<Record<string, unknown>>) || [];
    const m3u8Url = urlList.map((u) => u.url).find((u) => typeof u === 'string' && u) as
      | string
      | undefined;

    const durationEl = findElementByClass(webpage, 'layout-product-data-time');
    const tags = findElementsByClass(webpage, 'search-tag')
      .map((t) => clean_html(t))
      .filter(Boolean) as string[];

    return {
      id: videoId,
      title:
        this._html_search_meta(['og:title', 'twitter:title'], webpage) || videoId,
      description: this._html_search_meta('description', webpage) || undefined,
      formats: m3u8Url
        ? await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false)
        : [],
      thumbnail: this._html_search_meta('og:image', webpage) || undefined,
      duration: parse_duration(durationEl) ?? undefined,
      tags: tags.length ? tags : undefined,
    };
  }
}

export class VrSquarePlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'vrsquareplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _BASE_URL = 'https://livr.jp';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('VrSquarePlaylistBaseIE is not a standalone extractor', {
      expected: true,
    });
  }

  protected *_fetchVids(source: string): Generator<VideoInfo> {
    for (const tag of findElementsByClass(source, 'video', true)) {
      const attrs = extract_attributes(tag);
      const dataUrl = attrs['data-url'];
      if (!dataUrl) continue;
      const path = dataUrl.replace(/^\/contents\//, '');
      yield this.url_result(
        `${VrSquarePlaylistBaseIE._BASE_URL}/contents/${path}`,
        VrSquareIE.IE_NAME,
        path,
      );
    }
  }

  protected async _entries(
    path: string,
    displayId: string,
    query?: Record<string, string>,
  ): Promise<VideoInfo[]> {
    const entries: VideoInfo[] = [];
    for (let page = 1; page < 500; page++) {
      const ajax = await this._download_json<Record<string, unknown>>(
        `${VrSquarePlaylistBaseIE._BASE_URL}${path}`,
        displayId,
        `Downloading playlist JSON page ${page}`,
        { query: { p: String(page), ...(query || {}) } },
      );
      const renderList = (ajax.contents_render_list as string[]) || [];
      for (const chunk of renderList) {
        entries.push(...this._fetchVids(String(chunk)));
      }
      const hasNext = !!(ajax.has_next ?? ajax.hasNext);
      if (!hasNext) break;
    }
    return entries;
  }
}

export class VrSquareChannelIE extends VrSquarePlaylistBaseIE {
  static IE_NAME = 'vrsquare:channel';
  static _VALID_URL = /https?:\/\/livr\.jp\/channel\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    return this.playlist_result(
      await this._entries(`/ajax/channel/${playlistId}`, playlistId),
      playlistId,
      this._html_search_meta('og:title', webpage),
    );
  }
}

export class VrSquareSearchIE extends VrSquarePlaylistBaseIE {
  static IE_NAME = 'vrsquare:search';
  static _VALID_URL = /https?:\/\/livr\.jp\/web-search\/?\?(?:[^#]+&)?w=[^#]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const searchQuery = parse_qs(url).w?.[0];
    if (!searchQuery) throw new ExtractorError('Missing search query', { expected: true });
    return this.playlist_result(
      await this._entries('/ajax/web-search', searchQuery, { w: searchQuery }),
      searchQuery,
    );
  }
}

export class VrSquareSectionIE extends VrSquarePlaylistBaseIE {
  static IE_NAME = 'vrsquare:section';
  static _VALID_URL = /https?:\/\/livr\.jp\/(?:category|headline)\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    return this.playlist_result(
      [...this._fetchVids(webpage)],
      playlistId,
      this._html_search_meta('og:title', webpage),
    );
  }
}
