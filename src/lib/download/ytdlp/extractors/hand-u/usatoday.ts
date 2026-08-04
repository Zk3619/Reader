// @ts-nocheck
/** USATodayIE â€?ported from yt-dlp usatoday.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration, try_get, update_url_query } from '../../utils';
import { get_element_by_attribute } from './_helpers';

export class USATodayIE extends InfoExtractor {
  static IE_NAME = 'usatoday';
  static _VALID_URL = /https?:\/\/(?:www\.)?usatoday\.com\/(?:[^/]+\/)*(?<id>[^?/#]+)/;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/%s/default_default/index.html?videoId=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(update_url_query(url, { ajax: 'true' }), displayId);
    const uiVideoData = get_element_by_attribute('class', 'ui-video-data', webpage);
    if (!uiVideoData) throw new ExtractorError('no video on the webpage', { expected: true });
    const videoData = this._parse_json<Record<string, unknown>>(uiVideoData, displayId)!;
    const item =
      (try_get(videoData, (x) => (x.asset_metadata as Record<string, unknown>)?.items) as
        | Record<string, unknown>
        | null) || {};

    const account = (item.brightcoveaccount as string) || '29906170001';
    const bcId = (item.brightcoveid as string) || String(videoData.brightcove_id);

    return {
      _type: 'url_transparent',
      url: `http://players.brightcove.net/${account}/default_default/index.html?videoId=${bcId}`,
      id: String(videoData.id),
      title: String(videoData.title || displayId),
      thumbnail: videoData.thumbnail as string | undefined,
      description: videoData.description as string | undefined,
      duration: parse_duration(videoData.length) ?? undefined,
      ie_key: 'BrightcoveNew',
    };
  }
}
