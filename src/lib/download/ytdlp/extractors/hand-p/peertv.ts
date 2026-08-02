/** PeerTVIE — ported from yt-dlp peertv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json } from '../../utils';

export class PeerTVIE extends InfoExtractor {
  static IE_NAME = 'peer.tv';
  static _VALID_URL = /https?:\/\/(?:www\.)?peer\.tv\/(?:de|it|en)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const videoKey = this._search_regex(/player\.peer\.tv\/js\/([a-zA-Z0-9]+)/, webpage, 'video key')!;
    const js = await this._download_webpage(`https://player.peer.tv/js/${videoKey}/`, videoId, undefined, {
      headers: { Referer: 'https://www.peer.tv/' },
    });
    const sessionId = this._search_regex(/["']session_id["']:\s*["']([a-zA-Z0-9]+)["']/, js, 'session id')!;
    const playerWebpage = await this._download_webpage(
      `https://player.peer.tv/jsc/${videoKey}/${sessionId}?jsr=aHR0cHM6Ly93d3cucGVlci50di9kZS84NDE=&cs=UTF-8&mq=2&ua=0&webm=p&mp4=p&hls=1`,
      videoId,
      'Downloading player webpage',
    );
    const m3u8Raw = this._search_regex(/["']playlist_url["']:\s*(["'][^"']+["'])/, playerWebpage, 'm3u8 url')!;
    const m3u8Url = this._parse_json(m3u8Raw, videoId, js_to_json) as string;
    const formats: Format[] = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');

    return {
      id: videoId,
      title: (this._html_search_regex(/<h1>(.+?)<\/h1>/, webpage, 'title') || videoId).replace(/\xa0/g, ' '),
      formats,
      description: this._html_search_meta(['og:description', 'description'], webpage, null, false) ?? undefined,
      thumbnail: this._html_search_meta(['og:image', 'image'], webpage, null, false) ?? undefined,
    };
  }
}
