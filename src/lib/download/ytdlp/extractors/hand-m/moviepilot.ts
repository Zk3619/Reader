/**
 * MoviepilotIE — ported from yt-dlp moviepilot.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { searchNextjsData } from './_helpers';

export class MoviepilotIE extends InfoExtractor {
  static IE_NAME = 'moviepilot';
  static _VALID_URL = /https?:\/\/(?:www\.)?moviepilot\.de\/movies\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(
      `https://www.moviepilot.de/movies/${videoId}/trailer`,
      videoId,
    );
    const pageProps = searchNextjsData(this, webpage, videoId);
    const clip = ((pageProps.initialProps as Record<string, unknown>)?.pageProps || {}) as Record<
      string,
      unknown
    >;
    const video = (clip.video as Record<string, unknown>) || {};

    return {
      _type: 'url_transparent',
      ie_key: 'dailymotion',
      display_id: videoId,
      title: clip.title as string | undefined,
      url: `https://www.dailymotion.com/video/${video.remoteId}`,
      description: clip.summary as string | undefined,
      id: String(video.remoteId ?? videoId),
    };
  }
}
