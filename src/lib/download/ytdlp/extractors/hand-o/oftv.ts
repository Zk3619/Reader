/** OfTVIE / OfTVPlaylistIE — ported from yt-dlp oftv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { playlistFromMatches } from './_helpers';

const ZYPE_EMBED_RE =
  /(?:https?:)?\/\/player\.zype\.com\/embed\/[\da-fA-F]+\.(?:js|json|html)\?[^"']+/;

export class OfTVIE extends InfoExtractor {
  static IE_NAME = 'oftv';
  static _VALID_URL = /https?:\/\/(?:www\.)?of\.tv\/video\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const zypeMatch = webpage.match(ZYPE_EMBED_RE);
    if (!zypeMatch) throw new ExtractorError('Zype embed not found', { expected: true });

    const zypeUrl = zypeMatch[0].startsWith('//') ? `https:${zypeMatch[0]}` : zypeMatch[0];
    const creator = this._search_regex(
      /<a[^>]+class="creator-name"[^>]+>([^<]+)/,
      webpage,
      'creator',
      null,
      false,
    );

    return {
      ...this.url_result(zypeUrl, 'Zype', videoId),
      _type: 'url_transparent',
      creator: creator || undefined,
    };
  }
}

export class OfTVPlaylistIE extends InfoExtractor {
  static IE_NAME = 'oftv:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?of\.tv\/creators\/(?<id>[a-zA-Z0-9-]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const jsonMatch = this._search_json<Array<{ discovery_url?: string }>>(
      /var\s*remaining_videos\s*=/,
      webpage,
      'oftv playlists',
      playlistId,
    )!;

    const urls = (jsonMatch || []).map((v) => v.discovery_url).filter(Boolean) as string[];
    return playlistFromMatches(this, urls, playlistId);
  }
}
