/** SovietsClosetBaseIE / SovietsClosetIE / SovietsClosetPlaylistIE — ported from yt-dlp sovietscloset.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, try_get, unified_timestamp } from '../../utils';

const MEDIADELIVERY_REFERER = { Referer: 'https://iframe.mediadelivery.net/' };

export class SovietsClosetBaseIE extends InfoExtractor {
  static IE_NAME = 'sovietsclosetbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected parseNuxtJsonp(nuxtJsonp: string, videoId: string): Record<string, unknown> {
    const raw = this._search_regex(/__NUXT_JSONP__\([^,]+,\s*(\{[\s\S]+\})\)/, nuxtJsonp, 'nuxt data', null, false) || '{}';
    return this._parse_json<Record<string, unknown>>(raw, videoId) || {};
  }

  protected async parseNuxtJsonpUrl(nuxtJsonpUrl: string, videoId: string, name: string) {
    const nuxtJsonp = await this._download_webpage(nuxtJsonpUrl, videoId, `Downloading ${name} __NUXT_JSONP__`);
    return this.parseNuxtJsonp(nuxtJsonp, videoId);
  }

  protected videoMeta(
    videoId: string,
    gameName: string,
    categoryName: string | undefined,
    episodeNumber: number | undefined,
    streamDate: unknown,
  ): Partial<VideoInfo> {
    let title = gameName;
    if (categoryName && categoryName !== 'Misc') title += ` - ${categoryName}`;
    if (episodeNumber) title += ` #${episodeNumber}`;
    const timestamp = unified_timestamp(streamDate) ?? undefined;
    return {
      id: videoId,
      title,
      http_headers: MEDIADELIVERY_REFERER,
      uploader: 'SovietWomble',
      creator: 'SovietWomble',
      release_timestamp: timestamp,
      timestamp,
      uploader_id: 'SovietWomble',
      uploader_url: 'https://www.twitch.tv/SovietWomble',
      was_live: true,
      availability: 'public',
      series: gameName,
      season: categoryName,
      episode_number: episodeNumber,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('SovietsClosetBaseIE is not a standalone extractor');
  }
}

export class SovietsClosetIE extends SovietsClosetBaseIE {
  static IE_NAME = 'sovietscloset';
  static _VALID_URL = /https?:\/\/(?:www\.)?sovietscloset\.com\/video\/(?<id>[0-9]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const staticBase = this._search_regex(/(\/_nuxt\/static\/\d+)/, webpage, 'staticAssetsBase')!;
    const payload = await this.parseNuxtJsonpUrl(
      `https://sovietscloset.com${staticBase}/video/${videoId}/payload.js`,
      videoId,
      'video',
    );
    const stream = payload.stream as Record<string, unknown>;
    const game = stream.game as Record<string, unknown>;
    return {
      ...this.url_result(
        `https://iframe.mediadelivery.net/embed/5105/${stream.bunnyId}`,
        'BunnyCdn',
        videoId,
      ),
      ...this.videoMeta(
        videoId,
        String(game.name),
        try_get(stream, (x) => (x.subcategory as Record<string, unknown>)?.name) as string | undefined,
        stream.number as number | undefined,
        stream.date,
      ),
    };
  }
}

export class SovietsClosetPlaylistIE extends SovietsClosetBaseIE {
  static IE_NAME = 'sovietscloset:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?sovietscloset\.com\/(?!video)(?<id>[^#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let playlistId = this._match_id(url).replace(/\/$/, '');
    const webpage = await this._download_webpage(url, playlistId);
    const staticBase = this._search_regex(/(\/_nuxt\/static\/\d+)/, webpage, 'staticAssetsBase')!;
    const global = await this.parseNuxtJsonpUrl(
      `https://sovietscloset.com${staticBase}/payload.js`,
      playlistId,
      'global',
    );
    const games = (global.games as Array<Record<string, unknown>>) || [];
    let gameSlug: string;
    let categorySlug: string;
    if (playlistId.includes('/')) {
      [gameSlug, categorySlug] = playlistId.toLowerCase().split('/');
    } else {
      gameSlug = playlistId.toLowerCase();
      categorySlug = 'misc';
    }
    const game = games.find((g) => String(g.slug).toLowerCase() === gameSlug)!;
    const subcategories = (game.subcategories as Array<Record<string, unknown>>) || [];
    const category =
      subcategories.find((c) => String(c.slug || '').toLowerCase() === categorySlug) || subcategories[0]!;
    categorySlug = String(category.slug || '').toLowerCase() || categorySlug;
    let playlistTitle = String(game.name || gameSlug);
    if (categorySlug !== 'misc') playlistTitle += ` - ${category.name || categorySlug}`;
    const entries: VideoInfo[] = [];
    for (let i = 0; i < ((category.streams as unknown[]) || []).length; i++) {
      const stream = (category.streams as Array<Record<string, unknown>>)[i]!;
      entries.push({
        ...this.url_result(`https://sovietscloset.com/video/${stream.id}`, 'SovietsCloset'),
        ...this.videoMeta(
          str_or_none(stream.id) || '',
          String(game.name),
          category.name as string | undefined,
          i + 1,
          stream.date,
        ),
      });
    }
    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}
