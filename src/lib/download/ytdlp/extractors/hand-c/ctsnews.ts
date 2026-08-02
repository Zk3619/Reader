/**
 * CtsNewsIE — ported from yt-dlp ctsnews.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_timestamp } from '../../utils';
import { extractYoutubeEmbedUrl, hiddenInputs } from './_helpers';

export class CtsNewsIE extends InfoExtractor {
  static IE_NAME = 'ctsnews';
  static IE_DESC = '華視新聞';
  static _VALID_URL = /https?:\/\/news\.cts\.com\.tw\/[a-z]+\/[a-z]+\/\d+\/(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let newsId = this._match_id(url);
    const page = await this._download_webpage(url, newsId);

    newsId = hiddenInputs(page).get_id || '';

    let videoUrl: string;
    if (newsId) {
      const mp4Feed = await this._download_json<{ source_url: string }>(
        'http://news.cts.com.tw/action/test_mp4feed.php',
        newsId,
        'Fetching feed',
        { query: { news_id: newsId } },
      );
      videoUrl = mp4Feed.source_url;
    } else {
      this.to_screen('Not CTSPlayer video, trying Youtube...');
      const youtubeUrl = extractYoutubeEmbedUrl(page);
      return this.url_result(youtubeUrl!, 'Youtube');
    }

    const description = this._html_search_meta('description', page) || undefined;
    const title = this._html_search_meta('title', page, undefined, true)!;
    const thumbnail = this._html_search_meta('image', page) || undefined;

    const datetimeStr = this._html_search_regex(/(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2})/, page, 'date and time', null, false);
    let timestamp: number | undefined;
    if (datetimeStr) {
      const ts = unified_timestamp(datetimeStr);
      timestamp = ts != null ? ts - 8 * 3600 : undefined;
    }

    return {
      id: newsId,
      url: videoUrl,
      title,
      description,
      thumbnail,
      timestamp,
    };
  }
}
