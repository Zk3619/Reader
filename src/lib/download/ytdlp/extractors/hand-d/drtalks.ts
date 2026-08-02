/**
 * DrTalksIE — ported from yt-dlp drtalks.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, url_or_none } from '../../utils';
import { searchNextjsData } from './_helpers';

export class DrTalksIE extends InfoExtractor {
  static IE_NAME = 'drtalks';
  static _VALID_URL = /https?:\/\/(?:www\.)?drtalks\.com\/videos\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextData = searchNextjsData(this, webpage, videoId);
    const pageProps = nextData.pageProps as Record<string, unknown>;
    const data = (pageProps.data as Record<string, unknown>) || {};
    const video = (data.video as Record<string, unknown>) || {};
    const videos = (video.videos as Record<string, unknown>) || {};

    return {
      ...this.url_result(String(videos.brightcoveVideoLink ?? ''), 'BrightcoveNew', videoId),
      _type: 'url_transparent',
      title: traverse_obj(video, ['title', String]) as string | undefined,
      description: traverse_obj(video, ['videos', 'summury', String]) as string | undefined,
      thumbnail: traverse_obj(video, ['featuredImage', 'node', 'sourceUrl', url_or_none]) as string | undefined,
    };
  }
}
