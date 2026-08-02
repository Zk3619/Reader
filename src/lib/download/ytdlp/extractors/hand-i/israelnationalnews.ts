/**
 * IsraelNationalNewsIE — ported from yt-dlp israelnationalnews.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { playlistFromMatches } from './_helpers';

export class IsraelNationalNewsIE extends InfoExtractor {
  static IE_NAME = 'israelnationalnews';
  static _VALID_URL = /https?:\/\/(?:www\.)?israelnationalnews\.com\/news\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const newsArticleId = this._match_id(url);
    const articleJson = await this._download_json<Record<string, unknown>>(
      `https://www.israelnationalnews.com/Generic/NewAPI/Item?type=0&Item=${newsArticleId}`,
      newsArticleId,
    );

    const urls: string[] = [];
    const content2 = articleJson.Content2;
    if (Array.isArray(content2)) {
      for (const block of content2) {
        const content = (block as Record<string, unknown>).content;
        if (!Array.isArray(content)) continue;
        for (const item of content) {
          const src = traverse_obj(item, ['attrs', 'src']);
          if (typeof src === 'string') urls.push(src);
        }
      }
    }
    if (!urls?.length) {
      throw new ExtractorError('This article does not have any videos', { expected: true });
    }

    return playlistFromMatches(this, urls, newsArticleId, { ie: 'Youtube' });
  }
}
