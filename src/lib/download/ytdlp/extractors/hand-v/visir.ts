// @ts-nocheck
/**
 * VisirIE �?ported from yt-dlp visir.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  js_to_json,
  url_or_none,
} from '../../utils';
import { urljoin } from './_helpers';

const IS_MONTHS: Record<string, number> = {
  janúar: 1,
  febrúar: 2,
  mars: 3,
  apríl: 4,
  maí: 5,
  júní: 6,
  júlí: 7,
  ágúst: 8,
  september: 9,
  október: 10,
  nóvember: 11,
  desember: 12,
};

function monthByNameIs(name: string | null | undefined): number | null {
  if (!name) return null;
  return IS_MONTHS[name.toLowerCase()] ?? null;
}

function findElementByClass(html: string, cls: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[0] ?? null;
}

export class VisirIE extends InfoExtractor {
  static IE_NAME = 'visir';
  static IE_DESC = 'Vísir';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?visir\.is\/(?<type>k|player)\/(?<id>[\da-f-]+)(?:\/(?<slug>[\w.-]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoType = m.groups!.type!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.slug || undefined;
    const webpage = await this._download_webpage(url, videoId);

    if (videoType === 'player') {
      const realUrl =
        this._og_search_property('url', webpage, 'og url', false) ||
        this._html_search_meta('og:url', webpage);
      if (
        !realUrl ||
        !VisirIE.suitable(realUrl) ||
        this._match_valid_url(realUrl)?.groups?.type === 'player'
      ) {
        throw new ExtractorError(`Unsupported URL: ${realUrl || url}`, { expected: true });
      }
      return this.url_result(realUrl, this.ie_key);
    }

    let uploadDate: string | undefined;
    const dateEl = findElementByClass(webpage, 'article-item__date');
    const dateText = clean_html(dateEl);
    if (dateText) {
      const parts = dateText.split(/\s+/).filter(Boolean);
      if (parts.length === 3) {
        const day = int_or_none(parts[0]!.replace(/\.$/, ''));
        const month = monthByNameIs(parts[1]);
        const year = parts[2]!;
        if (day && month && /^[0-9]{4}$/.test(year)) {
          uploadDate = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
        }
      }
    }

    const player =
      this._search_json<Record<string, unknown>>(
        /App\.Player\.Init\(/,
        webpage,
        'player',
        videoId,
        { transform_source: js_to_json },
      ) || {};

    const filePath = player.File != null ? String(player.File) : '';
    const m3u8Url = filePath ? urljoin('https://vod.visir.is/', filePath) : '';

    const pressAds = findElementByClass(webpage, 'article-item') || '';
    // Prefer the press-ads block when present
    const pressAdsAlt =
      webpage.match(
        /<[^>]+class=["'][^"']*\barticle-item\b[^"']*\bpress-ads\b[^"']*["'][^>]*>[\s\S]*?(?=<div[^>]+class=["'][^"']*\barticle-item\b|$)/i,
      )?.[0] || pressAds;

    const descEl = findElementByClass(pressAdsAlt, '-large');
    const viewEl = findElementByClass(pressAdsAlt, 'article-item__viewcount');
    const category = clean_html(player.Categoryname != null ? String(player.Categoryname) : null);

    return {
      id: videoId,
      display_id: displayId,
      formats: await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4'),
      upload_date: uploadDate,
      description: clean_html(descEl) || undefined,
      view_count: int_or_none(clean_html(viewEl)) ?? undefined,
      title: clean_html(player.Title != null ? String(player.Title) : null) || videoId,
      categories: category ? [category] : undefined,
      duration: int_or_none(player.MediaDuration) ?? undefined,
      thumbnail: url_or_none(player.Image) ?? undefined,
    };
  }
}
