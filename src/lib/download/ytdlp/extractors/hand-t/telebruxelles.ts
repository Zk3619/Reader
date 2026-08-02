/** TeleBruxellesIE — ported from yt-dlp telebruxelles.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

async function extractWowzaFormats(
  ie: InfoExtractor,
  rawUrl: string,
  videoId: string,
): Promise<Format[]> {
  const url = rawUrl.replace(/^rmtp/, 'rtmp').replace(/"\s*\+\s*"/g, '');
  if (/^rtmp/i.test(url)) {
    const m = url.match(/^(?<url>rtmp[s]?:\/\/[^/]+\/(?<app>[^/]+))\/(?<playpath>.+)$/i);
    if (m?.groups) {
      return [{ url, format_id: 'rtmp', protocol: 'rtmp', app: m.groups.app, play_path: m.groups.playpath }];
    }
    return [{ url, format_id: 'rtmp', protocol: 'rtmp' }];
  }
  const base = url.replace(/\/(?:manifest|playlist|jwplayer)\.(?:m3u8|f4m|mpd|smil)/, '');
  const httpBase = base.replace(/^rtmp(s)?:/, 'http$1:');
  return (await extractM3u8FormatsAndSubtitles(ie, `${httpBase}/playlist.m3u8`, videoId, 'hls')).formats;
}

export class TeleBruxellesIE extends InfoExtractor {
  static IE_NAME = 'telebruxelles';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:telebruxelles|bx1)\.be\/(?:[^/]+\/)*(?<id>[^/#?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const articleId =
      this._html_search_regex(/<article[^>]+\bid=["']post-(\d+)/, webpage, 'article ID', null, false) ?? undefined;
    const title =
      this._html_search_regex(/<h1[^>]*>(.+?)<\/h1>/, webpage, 'title', null, false) ||
      this._og_search_title(webpage, false) ||
      displayId;

    const rtmpRaw = this._html_search_regex(
      /file["']?\s*:\s*"(r(?:tm|mt)ps?:\/\/[^/]+\/(?:vod\/mp4:"\s*\+\s*"[^"]+"\s*\+\s*"\.mp4|stream\/live))"/,
      webpage,
      'RTMP url',
    )!;
    const formats = await extractWowzaFormats(this, rtmpRaw, articleId || displayId);
    const isLive = rtmpRaw.includes('stream/live');

    return {
      id: articleId || displayId,
      display_id: displayId,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      formats,
      is_live: isLive,
    };
  }
}
