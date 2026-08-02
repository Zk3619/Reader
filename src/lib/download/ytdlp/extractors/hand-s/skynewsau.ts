/** SkyNewsAUIE — ported from yt-dlp skynewsau.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class SkyNewsAUIE extends InfoExtractor {
  static IE_NAME = 'skynewsau';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?skynews\.com\.au\/[^/]+\/[^/]+\/[^/]+\/video\/(?<id>[a-z0-9]+)/;
  static _API_KEY = '6krsj3w249nk779d8fukqx9f';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const embedcode = this._search_regex(/embedcode\s?=\s?\"([^\"]+)\"/, webpage, 'embedcode')!;
    const dataJson = await this._download_json<{ content?: Record<string, unknown> }>(
      `https://content.api.news/v3/videos/brightcove/${embedcode}?api_key=${SkyNewsAUIE._API_KEY}`,
      videoId,
    );
    const content = dataJson.content || {};
    const [accountId, bcVideoId] = embedcode.split('-');
    return {
      id: videoId,
      _type: 'url_transparent',
      url: `https://players.brightcove.net/${accountId}/default_default/index.html?videoId=${bcVideoId}`,
      ie_key: 'BrightcoveNew',
      title: content.caption as string | undefined,
      upload_date: unified_strdate((content.date as Record<string, unknown>)?.created) ?? undefined,
    };
  }
}
