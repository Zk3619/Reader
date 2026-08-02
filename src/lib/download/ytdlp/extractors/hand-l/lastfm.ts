/**
 * LastFMPlaylistBaseIE / LastFMPlaylistIE / LastFMUserIE / LastFMIE — ported from yt-dlp lastfm.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_qs } from '../../utils';
import { playlistFromMatches } from './_helpers';

export class LastFMPlaylistBaseIE extends InfoExtractor {
  static IE_NAME = 'lastfmplaylistbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LastFMPlaylistBaseIE is not a standalone extractor', { expected: true });
  }

  protected async *_entries(url: string, playlistId: string): AsyncGenerator<string> {
    const qs = parse_qs(url);
    const singlePage = int_or_none(qs.page?.[qs.page.length - 1]);
    let page = singlePage || 1;
    while (true) {
      const webpage = await this._download_webpage(url, playlistId, `Downloading page ${page}`, { query: { page: String(page) } });
      const videos = [...webpage.matchAll(/data-youtube-url="([^"]+)"/g)].map((m) => m[1]!);
      for (const v of videos) yield v;
      if (singlePage || !videos.length) return;
      page += 1;
    }
  }

  protected async _playlistFromUrl(url: string, playlistId: string): Promise<VideoInfo> {
    const urls: string[] = [];
    for await (const u of this._entries(url, playlistId)) urls.push(u);
    return playlistFromMatches(this, urls, playlistId, { ie: 'Youtube' });
  }
}

export class LastFMPlaylistIE extends LastFMPlaylistBaseIE {
  static IE_NAME = 'lastfm:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?last\.fm\/(?:music|tag)\/(?<id>[^/]+)(?:\/[^/]+)?\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._playlistFromUrl(url, this._match_id(url));
  }
}

export class LastFMUserIE extends LastFMPlaylistBaseIE {
  static IE_NAME = 'lastfm:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?last\.fm\/user\/[^/]+\/playlists\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._playlistFromUrl(url, this._match_id(url));
  }
}

export class LastFMIE extends InfoExtractor {
  static IE_NAME = 'lastfm';
  static _VALID_URL = /https?:\/\/(?:www\.)?last\.fm\/music(?:\/[^/]+){2}\/(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playerUrl = this._search_regex(/class="header-new-playlink"\s+href="([^"]+)"/, webpage, 'player_url')!;
    return this.url_result(playerUrl, 'Youtube');
  }
}
