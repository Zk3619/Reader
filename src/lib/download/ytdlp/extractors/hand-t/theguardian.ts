/**
 * TheGuardianPodcastIE / TheGuardianPodcastPlaylistIE — ported from yt-dlp theguardian.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  get_element_by_class,
  unified_strdate,
} from '../../utils';
import { playlistFromMatches, urljoin } from './_helpers';

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9-]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
    'i',
  );
  const m = html.match(re);
  return m ? `<${m[1]}${m[2]}>` : null;
}

function getElementsHtmlByClass(cls: string, html: string): string[] {
  const re = new RegExp(
    `<([a-zA-Z0-9-]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
    'gi',
  );
  return [...html.matchAll(re)].map((m) => `<${m[1]}${m[2]}>`);
}

export class TheGuardianPodcastIE extends InfoExtractor {
  static IE_NAME = 'theguardian:podcast';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?theguardian\.com\/\w+\/audio\/\d{4}\/\w{3}\/\d{1,2}\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playerEl = getElementHtmlByClass('podcast__player', webpage) || '';
    return {
      id: videoId,
      title:
        this._og_search_title(webpage) ||
        get_element_by_class('content__headline', webpage) ||
        videoId,
      description: this._og_search_description(webpage) || undefined,
      creator: this._html_search_meta('author', webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      release_date:
        unified_strdate(this._html_search_meta('article:published_time', webpage) || undefined) ||
        undefined,
      url: extract_attributes(playerEl)['data-source'],
    };
  }
}

export class TheGuardianPodcastPlaylistIE extends InfoExtractor {
  static IE_NAME = 'theguardian:podcast:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?theguardian\.com\/\w+\/series\/(?<id>[\w-]+)(?:\?page=\d+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const baseUrl = url.replace(/\?page=\d+/, '');
    const webpage0 = await this._download_webpage(baseUrl, podcastId);
    const title =
      clean_html(
        get_element_by_class('index-page-header__title', webpage0) ||
          get_element_by_class('flagship-audio__title', webpage0) ||
          '',
      ) || podcastId;
    const description =
      this._og_search_description(webpage0) ||
      this._html_search_meta('description', webpage0) ||
      undefined;

    const paths: string[] = [];
    for (let page = 1; page < 500; page++) {
      const pageUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
      const webpage = await this._download_webpage(pageUrl, podcastId, `Downloading page ${page}`, {
        fatal: false,
      });
      if (!webpage) break;
      let count = 0;
      for (const el of getElementsHtmlByClass('fc-item--type-media', webpage)) {
        const dataId = extract_attributes(el)['data-id'];
        if (dataId) {
          paths.push(dataId.startsWith('/') ? dataId : `/${dataId}`);
          count++;
        }
      }
      if (page > 1 && count === 0) break;
    }

    return playlistFromMatches(
      this,
      paths.map((p) => urljoin('https://www.theguardian.com', p)),
      podcastId,
      { title, description, ie: 'TheGuardianPodcast' },
    );
  }
}
