/**
 * CamFMShowIE / CamFMEpisodeIE — ported from yt-dlp camfm.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, get_element_by_class, get_elements_by_class, unified_timestamp } from '../../utils';
import { parseHtml5MediaEntries, urljoin } from './_helpers';

export class CamFMShowIE extends InfoExtractor {
  static IE_NAME = 'camfmshow';
  static _VALID_URL = /https?:\/\/(?:www\.)?camfm\.co\.uk\/shows\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const page = await this._download_webpage(url, showId);

    const entries = [...page.matchAll(/javascript:popup\('(\/player\/[^']+)', 'listen'/g)].map((m) =>
      this.url_result(urljoin('https://camfm.co.uk', m[1]!), 'CamFMEpisode'),
    );

    const thumbnailPath = this._search_regex(
      /<img[^>]+class="thumb-expand"[^>]+src="([^"]+)"/,
      page,
      'thumbnail',
      null,
      false,
    );

    return {
      ...this.playlist_result(entries, showId, this._html_search_regex('<h1>([^<]+)</h1>', page, 'title', null, false) || undefined),
      thumbnail: thumbnailPath ? urljoin('https://camfm.co.uk', thumbnailPath) : undefined,
      description: clean_html(get_element_by_class('small-12 medium-8 cell', page)) || undefined,
    };
  }
}

export class CamFMEpisodeIE extends InfoExtractor {
  static IE_NAME = 'camfmepisode';
  static _VALID_URL = /https?:\/\/(?:www\.)?camfm\.co\.uk\/player\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const page = await this._download_webpage(url, episodeId);
    const audios = await parseHtml5MediaEntries(this, 'https://audio.camfm.co.uk', page, episodeId);

    const caption = get_element_by_class('caption', page) || '';
    const series = clean_html(caption.replace(/<span[^<]+<[^<]+>/g, ''));

    const cardSection = get_element_by_class('card-section', page) || '';
    const date = this._html_search_regex('>Aired at ([^<]+)<', cardSection, 'air date', null, false);

    const thumbnailPath = this._search_regex(
      /<div[^>]+class="cover-art"[^>]+style="[^"]+url\('([^']+)/,
      page,
      'thumbnail',
      null,
      false,
    );

    return {
      id: episodeId,
      title: [series, date].filter(Boolean).join(' - ') || undefined,
      formats: audios.flatMap((a) => a.formats),
      timestamp: date ? unified_timestamp(date) ?? undefined : undefined,
      series: series || undefined,
      description: clean_html(cardSection.replace(/<b>[^<]+<\/b><br[^>]+\/>/g, '')) || undefined,
      thumbnail: thumbnailPath ? urljoin('https://camfm.co.uk', thumbnailPath) : undefined,
      categories: get_elements_by_class('label', caption),
      was_live: true,
    };
  }
}
