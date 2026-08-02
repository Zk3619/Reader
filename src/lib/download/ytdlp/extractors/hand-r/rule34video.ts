/** Rule34VideoIE — ported from yt-dlp rule34video.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  int_or_none,
  parse_count,
  parse_duration,
  traverse_obj,
  unescapeHTML,
} from '../../utils';
import { htmlExtractTitle } from './_helpers';

function getElementByClass(cls: string, html: string): string | null {
  const m = html.match(new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return m ? m[1]! : null;
}

function getElementsByClass(cls: string, html: string): string[] {
  const re = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi');
  return [...html.matchAll(re)].map((m) => m[0]!);
}

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'i');
  return html.match(re)?.[0] ?? null;
}

export class Rule34VideoIE extends InfoExtractor {
  static IE_NAME = 'Rule34Video';
  static _VALID_URL = /https?:\/\/(?:www\.)?rule34video\.com\/videos?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats: Format[] = [];
    for (const m of webpage.matchAll(
      /<a[^>]+href="(?<video_url>[^"]+download=true[^"]+)"[^>]*>(?<ext>[^\s]+) (?<quality>[^<]+)p<\/a>/g,
    )) {
      formats.push({
        url: m.groups!.video_url!,
        ext: m.groups!.ext!.toLowerCase(),
        format_id: m.groups!.quality!,
        quality: int_or_none(m.groups!.quality!) ?? undefined,
      });
    }

    let categories: string[] | undefined;
    let creators: string[] | undefined;
    let uploader: string | undefined;
    let uploaderUrl: string | undefined;
    for (const col of getElementsByClass('col', webpage)) {
      const label = clean_html(getElementByClass('label', col) || '');
      if (label === 'Categories:') {
        categories = getElementsByClass('item', col).map((c) => clean_html(c)!).filter(Boolean);
      } else if (label === 'Artist:') {
        creators = getElementsByClass('item', col).map((c) => clean_html(c)!).filter(Boolean);
      } else if (label === 'Uploaded By:') {
        uploader = clean_html(getElementByClass('name', col) || '') || undefined;
        const nameEl = getElementHtmlByClass('name', col);
        uploaderUrl = nameEl ? extract_attributes(nameEl).href : undefined;
      }
    }

    const ld = (this._search_json_ld(webpage, videoId, { fatal: false }) || {}) as Record<string, unknown>;
    const commentEl = webpage.match(/<[^>]+\bhref=["']#tab_comments["'][^>]*>[\s\S]*?\((\d+)\)/i);

    return {
      ...traverse_obj(ld, {
        title: 'title',
        view_count: 'view_count',
        like_count: 'like_count',
        duration: 'duration',
        timestamp: 'timestamp',
        description: 'description',
        thumbnail: ['thumbnails', 0, 'url'],
      }),
      id: videoId,
      formats,
      title: htmlExtractTitle(webpage) ?? undefined,
      thumbnail:
        this._html_search_regex(/preview_url:\s+\'([^\']+)\'/, webpage, 'thumbnail', null, false) ?? undefined,
      duration:
        parse_duration(
          this._html_search_regex(/"icon-clock"><\/i>\s+<span>((?:\d+:?)+)/, webpage, 'duration', null, false) ||
            undefined,
        ) ?? undefined,
      view_count:
        int_or_none(
          (this._html_search_regex(/"icon-eye"><\/i>\s+<span>([ \d]+)/, webpage, 'views', null, false) || '').replace(
            / /g,
            '',
          ),
        ) ?? undefined,
      like_count: parse_count(getElementByClass('voters count', webpage) || undefined) ?? undefined,
      comment_count: commentEl ? int_or_none(commentEl[1]!) ?? undefined : undefined,
      age_limit: 18,
      creators,
      uploader,
      uploader_url: uploaderUrl,
      categories,
      tags: [...webpage.matchAll(/<a class="tag_item"[^>]+\bhref="https:\/\/rule34video\.com\/tags\/\d+\/"[^>]*>([^<]*)<\/a>/g)].map(
        (tm) => unescapeHTML(tm[1]!),
      ),
    };
  }
}
