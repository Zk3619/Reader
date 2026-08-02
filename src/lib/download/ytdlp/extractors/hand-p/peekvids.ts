/** PeekVidsBaseIE / PeekVidsIE / PlayVidsIE — ported from yt-dlp peekvids.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { get_element_by_class, int_or_none, merge_dicts, str_or_none, url_or_none } from '../../utils';

export class PeekVidsBaseIE extends InfoExtractor {
  static IE_NAME = 'peekvidsbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups?.domain!;
    const displayId = m.groups?.id!;
    const webpage = await this._download_webpage(url, displayId);
    if (webpage.includes('>Rate Limit Exceeded')) {
      throw new ExtractorError(
        'You are suspected as a bot. Wait, or pass the captcha on the site and provide cookies.',
        { expected: true },
      );
    }

    const title = this._html_search_regex(/<h1\b[^>]*>(.+?)<\/h1>/, webpage, 'title');
    const videoId = this._search_regex(/<video\b[^>]+\bdata-id\s*=\s*["']?([\w-]+)/, webpage, 'short video ID')!;
    const srcs = await this._download_json<Record<string, unknown>>(`https://www.${domain}/v-alt/${videoId}`, videoId, 'Downloading list of source files');

    const formats: Format[] = [];
    for (const [k, v] of Object.entries(srcs)) {
      const fUrl = url_or_none(v);
      if (!fUrl) continue;
      const height = this._search_regex(/^data-src(\d{3,})$/, k, 'height', null, false);
      if (height) {
        formats.push({ url: fUrl, format_id: height, height: int_or_none(height) ?? undefined });
      }
    }
    if (!formats.length) {
      for (const v of Object.values(srcs)) {
        const fUrl = url_or_none(v);
        if (fUrl) formats.push({ url: fUrl, format_id: 'http' });
      }
    }

    const info = this._search_json_ld(webpage, videoId, { fatal: false, expected_type: 'VideoObject' }) || {};
    delete (info as Record<string, unknown>).url;
    if (!info.thumbnail) info.thumbnail = this._og_search_thumbnail(webpage) ?? undefined;
    const detail = get_element_by_class('detail-video-block', webpage) || get_element_by_class('detail-block', webpage) || '';
    const ldDesc = str_or_none((info as Record<string, unknown>).description) || '';
    info.description =
      this._html_search_regex(new RegExp(`([\\s\\S]+?)(?:${ldDesc.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*<|<ul\\b)`), detail, 'description', null, false) ||
      undefined;
    info.title = (str_or_none(info.title) || title || '').replace(/\s*[,-][^,-]+$/, '') || displayId;

    const catTags = (name: string, html: string): string[] => {
      const block = this._html_search_regex(
        new RegExp(`<span\\b[^>]*>\\s*${name}\\s*:\\s*<\\/span>([\\s\\S]+?)<\\/li>`),
        html,
        name,
        null,
        false,
      );
      return block ? block.split(/\s+/).filter(Boolean) : [];
    };

    return merge_dicts({
      id: videoId,
      display_id: displayId,
      age_limit: 18,
      formats,
      categories: catTags('Categories', detail),
      tags: catTags('Tags', detail),
      uploader: this._html_search_regex(/[Uu]ploaded\s+by\s(.+?)"/, webpage, 'uploader', null, false) ?? undefined,
    }, info) as VideoInfo;
  }
}

export class PeekVidsIE extends PeekVidsBaseIE {
  static IE_NAME = 'peekvids';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<domain>peekvids\.com)\/(?:(?:[^/?#]+\/){2}|embed\/?\?(?:[^#]*&)?v=)(?<id>[^/?&#]*)/;
}

export class PlayVidsIE extends PeekVidsBaseIE {
  static IE_NAME = 'playvids';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<domain>playvids\.com)\/(?:embed\/|\w\w?\/)?(?<id>[^/?#]*)/;
}
