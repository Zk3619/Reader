/** ThisVidIE — ported from yt-dlp thisvid.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, get_element_by_class, int_or_none, url_or_none } from '../../utils';
import { playlistFromMatches, urljoin } from './_helpers';

export class ThisVidIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?thisvid\.com\/(?<type>videos|embed)\/(?<id>[A-Za-z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const mainId = m.groups!.id!;
    const type = m.groups!.type!;
    let webpage = await this._download_webpage(url, mainId);

    const title =
      this._html_search_regex(
        /<title\b[^>]*?>(?:Video:\s+)?(.+?)(?:\s+-\s+ThisVid(?:\.com| tube))?<\/title>/,
        webpage,
        'title',
      ) || mainId;

    if (type === 'embed') {
      const videoAltUrl = url_or_none(
        this._search_regex(
          new RegExp(`video_alt_url\\s*:\\s+'(${ThisVidIE._VALID_URL.source}/)'`),
          webpage,
          'video_alt_url',
          null,
          false,
        ),
      );
      if (videoAltUrl && videoAltUrl !== url) {
        webpage =
          (await this._download_webpage(videoAltUrl, mainId, 'Redirecting embed to main page', {
            fatal: false,
          })) || webpage;
      }
    }

    const videoHolder = get_element_by_class('video-holder', webpage) || '';
    if (videoHolder.includes('>This video is a private video')) {
      this.raise_login_required(
        (clean_html(videoHolder) || 'Private video').split('\n')[0] || 'Private video',
      );
    }

    const uploaderRaw = this._html_search_regex(
      /<span\b[^>]*>Added by:\s*<\/span><a\b[^>]+\bclass\s*=\s*["']author\b[^>]+\bhref\s*=\s*["']https:\/\/thisvid\.com\/members\/([0-9]+\/.{3,}?)\s*<\/a>/s,
      webpage,
      'uploader',
      null,
      false,
    );
    let uploaderId: string | undefined;
    let uploader: string | undefined;
    if (uploaderRaw) {
      const parts = uploaderRaw.split(/\/["'][^>]*>\s*/);
      if (parts.length === 2) {
        uploaderId = parts[0] || undefined;
        uploader = parts[1] || undefined;
      }
    }

    return {
      _type: 'url_transparent',
      ie_key: 'Generic',
      url,
      id: mainId,
      title,
      age_limit: 18,
      uploader,
      uploader_id: uploaderId,
    };
  }
}

export class ThisVidPlaylistBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;
  static _PLAYLIST_URL_RE: RegExp | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ThisVidPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected static *_findUrls(html: string, playlistUrlRe: RegExp): Generator<string> {
    const re = new RegExp(
      `<a\\b[^>]+\\bhref\\s*=\\s*["'](?<url>${playlistUrlRe.source}\\b)[^>]+>`,
      'gi',
    );
    for (const m of html.matchAll(re)) {
      if (m.groups?.url) yield m.groups.url;
    }
  }

  protected async *_generatePlaylistEntries(
    url: string,
    playlistId: string,
    html?: string | null,
  ): AsyncGenerator<string> {
    const playlistUrlRe = (this.constructor as typeof ThisVidPlaylistBaseIE)._PLAYLIST_URL_RE;
    if (!playlistUrlRe) return;

    let pageUrl = url;
    for (let page = 1; page < 10000; page++) {
      let pageHtml = html;
      if (!pageHtml) {
        pageHtml =
          (await this._download_webpage(pageUrl, playlistId, `Downloading page ${page}`, {
            fatal: false,
          })) || '';
      }

      yield* ThisVidPlaylistBaseIE._findUrls(pageHtml, playlistUrlRe);

      const nextPageEl = get_element_by_class('pagination-next', pageHtml) || '';
      let nextPage: string | null = null;
      if (nextPageEl) {
        nextPage = this._search_regex(
          /<a\b[^>]+\bhref\s*=\s*("|')(?<url>(?!#)(?:(?!\1).)+)/,
          nextPageEl,
          'next page link',
          'url',
          false,
        );
        if (nextPage) nextPage = urljoin(url, nextPage);
      }

      if (nextPage == null) {
        const parsed = new URL(pageUrl);
        const parts = parsed.pathname.replace(/\/$/, '').split('/');
        let num = int_or_none(parts[parts.length - 1]);
        let basePath: string;
        if (num == null) {
          basePath = parsed.pathname.replace(/\/$/, '');
          num = 1;
        } else {
          basePath = parts.slice(0, -1).join('/');
        }
        parsed.pathname = `${basePath}/${num + 1}`;
        nextPage = parsed.toString();
        if (pageUrl === nextPage) nextPage = null;
      }

      if (!nextPage) return;
      pageUrl = nextPage;
      html = null;
    }
  }

  protected async _makePlaylistResult(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);

    const rawTitle =
      this._og_search_title(webpage, false) ||
      this._html_search_regex(/<title\b[^>]*>([\s\S]+?)<\/title/, webpage, 'title', null, false) ||
      '';
    const title = rawTitle.split(/\s*\|\s*ThisVid\.com\s*$/i)[0]?.trim() || undefined;

    const urls: string[] = [];
    for await (const entryUrl of this._generatePlaylistEntries(url, playlistId, webpage)) {
      urls.push(entryUrl);
    }

    return playlistFromMatches(this, urls, playlistId, { title, ie: 'ThisVid' });
  }
}

export class ThisVidMemberIE extends ThisVidPlaylistBaseIE {
  static _VALID_URL = /https?:\/\/thisvid\.com\/members\/(?<id>\d+)/;
  static _PLAYLIST_URL_RE = ThisVidIE._VALID_URL;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._makePlaylistResult(url);
  }
}

export class ThisVidPlaylistIE extends ThisVidPlaylistBaseIE {
  static _VALID_URL =
    /https?:\/\/thisvid\.com\/playlist\/(?<id>\d+)\/video\/(?<video_id>[A-Za-z0-9-]+)/;
  static _PLAYLIST_URL_RE = ThisVidPlaylistIE._VALID_URL;

  protected async *_generatePlaylistEntries(
    url: string,
    playlistId: string,
    html?: string | null,
  ): AsyncGenerator<string> {
    for await (const wrappedUrl of super._generatePlaylistEntries(url, playlistId, html)) {
      const m = ThisVidPlaylistIE._VALID_URL.exec(wrappedUrl);
      const videoId = m?.groups?.video_id;
      if (videoId) yield urljoin(url, `/videos/${videoId}/`);
    }
  }

  protected _yesPlaylist(playlistId: string, videoId: string): boolean {
    if (this.params.noplaylist) return false;
    return playlistId !== videoId;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const videoId = m.groups!.video_id!;

    if (!this._yesPlaylist(playlistId, videoId)) {
      return this.url_result(urljoin(url, `/videos/${videoId}/`), 'ThisVid');
    }

    const result = await this._makePlaylistResult(url);

    const t = result.title || '';
    const tLen = t.length;
    if (tLen > 5 && tLen % 2 !== 0) {
      const half = Math.floor(tLen / 2);
      if (t[half] === '-') {
        const first = t.slice(0, half).trim();
        const second = t.slice(half + 1).trim();
        if (first && first === second) result.title = first;
      }
    }

    return result;
  }
}
