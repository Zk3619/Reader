/**
 * DLF / Deutschlandfunk — ported from yt-dlp dlf.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  int_or_none,
  str_or_none,
  url_or_none,
} from '../../utils';

const VALID_URL_BASE = /https?:\/\/(?:www\.)?deutschlandfunk\.de\//;
const BUTTON_REGEX = /(<button[^>]+alt="Anhören"[^>]+data-audio-diraid[^>]*>)/g;
const BUTTON_REGEX_ONE = /(<button[^>]+alt="Anhören"[^>]+data-audio-diraid[^>]*>)/;

export class DLFBaseIE extends InfoExtractor {
  static IE_NAME = 'dlfbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DLFBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _parseButtonAttrs(button: string, audioId?: string): Promise<VideoInfo> {
    const attrs = extract_attributes(button);
    const id = audioId || attrs['data-audio-diraid'];
    if (!id) throw new ExtractorError('Missing audio id in button', { expected: true });

    const url =
      url_or_none(attrs['data-audio-download-src']) ||
      url_or_none(attrs['data-audio']) ||
      url_or_none(attrs['data-audioreference']) ||
      url_or_none(attrs['data-audio-src']);
    if (!url) throw new ExtractorError('No audio URL in button', { expected: true });

    const ext = determine_ext(url);
    const title =
      str_or_none(attrs['data-audiotitle']) ||
      str_or_none(attrs['data-audio-title']) ||
      str_or_none(attrs['data-audio-download-tracking-title']) ||
      undefined;
    const duration =
      int_or_none(attrs['data-audioduration']) ?? int_or_none(attrs['data-audio-duration']) ?? undefined;

    let formats: Format[];
    if (ext === 'm3u8') {
      formats = await this._extract_m3u8_formats(url, id, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false);
    } else {
      formats = [{ url, ext, format_id: ext || 'http', vcodec: 'none' }];
    }

    return {
      id,
      extractor_key: 'DLF',
      extractor: DLFIE.IE_NAME,
      title,
      duration,
      thumbnail: url_or_none(attrs['data-audioimage']) ?? undefined,
      uploader: str_or_none(attrs['data-audio-producer']) ?? undefined,
      series: str_or_none(attrs['data-audio-series']) ?? undefined,
      channel: str_or_none(attrs['data-audio-origin-site-name']) ?? undefined,
      webpage_url: url_or_none(attrs['data-audio-download-tracking-path']) ?? undefined,
      formats,
    };
  }
}

export class DLFIE extends DLFBaseIE {
  static IE_NAME = 'dlf';
  static _VALID_URL = new RegExp(
    `${VALID_URL_BASE.source}[\\w-]+-dlf-(?<id>[\\da-f]{8})-100\\.html`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(url, audioId);
    const button = this._search_regex(BUTTON_REGEX_ONE, webpage, 'button');
    return this._parseButtonAttrs(button!, audioId);
  }
}

export class DLFCorpusIE extends DLFBaseIE {
  static IE_NAME = 'dlf:corpus';
  static IE_DESC = 'DLF Multi-feed Archives';
  static _VALID_URL = new RegExp(
    `${VALID_URL_BASE.source}(?<id>(?![\\w-]+-dlf-[\\da-f]{8})[\\w-]+-\\d+)\\.html`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const buttons = [...webpage.matchAll(BUTTON_REGEX)].map((m) => m[1]!);
    const entries = await Promise.all(buttons.map((b) => this._parseButtonAttrs(b)));
    return {
      _type: 'playlist',
      id: playlistId,
      description:
        this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage) ||
        undefined,
      title:
        this._html_search_meta(['og:title', 'twitter:title'], webpage) || undefined,
      entries,
      playlist_count: entries.length,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
    };
  }
}
