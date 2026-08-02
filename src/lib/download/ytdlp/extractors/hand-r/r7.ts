/** R7* — ported from yt-dlp r7.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class R7IE extends InfoExtractor {
  static IE_NAME = 'r7';
  static _VALID_URL =
    /https?:\/\/(?:(?:[a-zA-Z]+)\.r7\.com(?:\/[^/]+)+\/idmedia\/|noticias\.r7\.com(?:\/[^/]+)+\/[^/]+-|player\.r7\.com\/video\/i\/)(?<id>[\da-f]{24})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_json<Record<string, unknown>>(
      `http://player-api.r7.com/video/i/${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    const mediaUrlHls = video.media_url_hls as string | undefined;
    if (mediaUrlHls) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          mediaUrlHls,
          videoId,
          'mp4',
          'm3u8_native',
          'hls',
          undefined,
          undefined,
          undefined,
          false,
        )),
      );
    }
    const mediaUrl = video.media_url as string | undefined;
    if (mediaUrl) {
      let f: Format = { url: mediaUrl, format_id: 'http' };
      const m3u8Formats = formats.filter((fmt) => fmt.vcodec !== 'none');
      if (m3u8Formats.length === 1) {
        f = { ...m3u8Formats[0], url: mediaUrl, format_id: 'http', protocol: 'http' };
      }
      formats.push(f);
    }

    return {
      id: videoId,
      title: video.title as string,
      description: video.description as string | undefined,
      thumbnail: video.thumb as string | undefined,
      duration: int_or_none(video.media_duration) ?? undefined,
      like_count: int_or_none(video.likes) ?? undefined,
      view_count: int_or_none(video.views) ?? undefined,
      formats,
    };
  }
}

export class R7ArticleIE extends InfoExtractor {
  static IE_NAME = 'r7article';
  static _VALID_URL = /https?:\/\/(?:[a-zA-Z]+)\.r7\.com\/(?:[^/]+\/)+[^/?#&]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._search_regex(
      /<div[^>]+(?:id=["']player-|class=["']embed["'][^>]+id=["'])([\da-f]{24})/,
      webpage,
      'video id',
    )!;
    return this.url_result(`http://player.r7.com/video/i/${videoId}`, 'R7');
  }
}
