/**
 * NFL family — ported from yt-dlp nfl.py (video-config main path; NFL+ auth edges simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { clean_html, determine_ext, get_element_by_class, url_or_none } from '../../utils';

const VALID_URL_BASE =
  /https?:\/\/(?<host>(?:www\.)?(?:nfl|buffalobills|miamidolphins|patriots|newyorkjets|baltimoreravens|bengals|clevelandbrowns|steelers|houstontexans|colts|jaguars|(?:titansonline|tennesseetitans)|denverbroncos|(?:kc)?chiefs|raiders|chargers|dallascowboys|giants|philadelphiaeagles|(?:redskins|washingtonfootball)|chicagobears|detroitlions|packers|vikings|atlantafalcons|panthers|neworleanssaints|buccaneers|azcardinals|(?:stlouis|the)rams|49ers|seahawks)\.com|.+?\.clubs\.nfl\.com)\//;

const VIDEO_CONFIG_RE =
  /<script[^>]+id="[^"]*video-config-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}[^"]*"[^>]*>\s*({.+});?\s*<\/script>/g;

export class NFLBaseIE extends InfoExtractor {
  static IE_NAME = 'nflbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _ANVATO_PREFIX = 'anvato:GXvEgwyJeWem8KCYXfeoHWknwP48Mboj:';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NFLBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractVideo(mcpId: string, _isLive = false): Promise<VideoInfo> {
    this.raise_login_required('NFL API playback requires authenticated subscription (NFL+ edge not ported)');
    return { id: mcpId, formats: [] };
  }

  protected async _parseVideoConfig(videoConfigRaw: string, displayId: string): Promise<VideoInfo> {
    const videoConfig = this._parse_json<Record<string, unknown>>(videoConfigRaw, displayId)!;
    const isLive = Boolean(videoConfig.live);
    const item = ((videoConfig.playlist as Array<Record<string, unknown>>) || [])[0] || {};

    if (item.mcpID) {
      return this._extractVideo(String(item.mcpID), isLive);
    }

    const info: VideoInfo = { id: String(item.id || item.entityId || displayId) };
    const itemUrl = item.url as string | undefined;
    if (!itemUrl) throw new ExtractorError('Unable to extract media URL');

    const ext = determine_ext(itemUrl);
    if (ext === 'm3u8') {
      info.formats = await this._extract_m3u8_formats(itemUrl, String(info.id), 'mp4');
    } else {
      info.url = itemUrl;
      if (item.audio === true) info.vcodec = 'none';
    }

    const imageUrl = url_or_none(item.imageSrc) || url_or_none(item.posterImage);
    const thumbnails: Thumbnail[] = imageUrl ? [{ url: imageUrl }] : [];

    return {
      ...info,
      title: item.title as string | undefined,
      description: clean_html(String(item.description ?? '')) || undefined,
      is_live: isLive,
      thumbnails,
    };
  }
}

export class NFLIE extends NFLBaseIE {
  static IE_NAME = 'nfl.com';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE.source}(?:videos?|listen|audio)/(?<id>[^/#?&]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const match = [...webpage.matchAll(VIDEO_CONFIG_RE)][0];
    if (!match?.[1]) throw new ExtractorError('Unable to extract video config');
    return this._parseVideoConfig(match[1], displayId);
  }
}

export class NFLArticleIE extends NFLBaseIE {
  static IE_NAME = 'nfl.com:article';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE.source}news/(?<id>[^/#?&]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(VIDEO_CONFIG_RE)) {
      entries.push(await this._parseVideoConfig(m[1]!, displayId));
    }
    const title =
      clean_html(get_element_by_class('nfl-c-article__title', webpage) || '') ||
      this._html_search_meta(['og:title', 'twitter:title'], webpage) ||
      displayId;
    return this.playlist_result(entries, displayId, title);
  }
}

export class NFLPlusReplayIE extends NFLBaseIE {
  static IE_NAME = 'nfl.com:plus:replay';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nfl\.com\/plus\/games\/(?<slug>[\w-]+)(?:\/(?<id>\d+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const slug = m.groups?.slug || '';
    const gameId = m.groups?.id;
    if (gameId) {
      return this._extractVideo(gameId);
    }
    this.raise_login_required('NFL+ replay listing requires subscription (edge not ported)');
    return this.playlist_result([], slug);
  }
}

export class NFLPlusEpisodeIE extends NFLBaseIE {
  static IE_NAME = 'nfl.com:plus:episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nfl\.com\/plus\/(?:series|shows)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    this.raise_login_required('NFL+ episodes require subscription (edge not ported)');
    return { id: this._match_id(url), formats: [] };
  }
}
