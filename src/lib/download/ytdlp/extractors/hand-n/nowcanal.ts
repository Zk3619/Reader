/** NowCanalIE — ported from yt-dlp nowcanal.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class NowCanalIE extends InfoExtractor {
  static IE_NAME = 'NowCanal';
  static _VALID_URL = /https?:\/\/(?:www\.)?nowcanal\.pt(?:\/[\w-]+)+\/detalhe\/(?<id>[\w-]+)/;

  protected static _BC_URL_TMPL =
    'https://players.brightcove.net/6108484330001/chhIqzukMq_default/index.html?videoId={}';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoData = this._search_json<{ brightcoveVideoId?: string }>(
      /videoHandler\.addBrightcoveVideoWithJson\(\[/,
      webpage,
      'video data',
      displayId,
    )!;
    const videoId = String(videoData.brightcoveVideoId ?? '');
    return this.url_result(NowCanalIE._BC_URL_TMPL.replace('{}', videoId), 'BrightcoveNew', videoId);
  }
}
