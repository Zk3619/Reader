/**
 * KaraoketvIE — ported from yt-dlp karaoketv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class KaraoketvIE extends InfoExtractor {
  static IE_NAME = 'karaoketv';
  static _VALID_URL = /https?:\/\/(?:www\.)?karaoketv\.co\.il\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const apiPageUrl = this._search_regex(
      /<iframe[^>]+src=(["'])(?<url>https?:\/\/www\.karaoke\.co\.il\/api_play\.php\?.+?)\1/,
      webpage,
      'API play URL',
      null,
      true,
      'url',
    )!;

    const apiPage = await this._download_webpage(apiPageUrl, videoId);
    const videoCdnUrl = this._search_regex(
      /<iframe[^>]+src=(["'])(?<url>https?:\/\/www\.video-cdn\.com\/embed\/iframe\/.+?)\1/,
      apiPage,
      'video cdn URL',
      null,
      true,
      'url',
    )!;

    const videoCdn = await this._download_webpage(videoCdnUrl, videoId);
    const playPath = this._parse_json<{ clip?: { url?: string } }>(
      this._search_regex(/var\s+options\s*=\s*({.+?});/, videoCdn, 'options'),
      videoId,
    )!.clip!.url!;

    const settings =
      this._parse_json<{ servers?: string[] }>(
        this._search_regex(/var\s+settings\s*=\s*({.+?});/, videoCdn, 'servers', '{}', false)!,
        videoId,
        null,
        false,
      ) || {};

    let servers = settings.servers;
    if (!servers || !Array.isArray(servers)) {
      servers = ['wowzail.video-cdn.com:80/vodcdn'];
    }

    const formats: Format[] = servers.map((server) => ({
      url: server.startsWith('rtmp') ? server : `rtmp://${server}`,
      play_path: playPath,
      app: 'vodcdn',
      page_url: videoCdnUrl,
      player_url: 'http://www.video-cdn.com/assets/flowplayer/flowplayer.commercial-3.2.18.swf',
      rtmp_real_time: true,
      ext: 'flv',
      format_id: 'rtmp',
    }));

    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? undefined,
      formats,
    };
  }
}
