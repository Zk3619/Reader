/** NineNewsIE — ported from yt-dlp ninenews.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';

export class NineNewsIE extends InfoExtractor {
  static IE_NAME = '9News';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?9news\.com\.au\/(?:[\w-]+\/){2,3}(?<id>[\w-]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const initialState = this._search_json<Record<string, unknown>>(
      /var\s+__INITIAL_STATE__\s*=/,
      webpage,
      'initial state',
      articleId,
    );
    const videoId = str_or_none(traverse_obj(initialState, ['videoIndex', 'currentVideo', 'brightcoveId']));
    const account = str_or_none(
      traverse_obj(initialState, ['videoIndex', 'config', 0, 'video', 'account']) ??
        traverse_obj(initialState, ['videoIndex', 'config', 'video', 'account']),
    );

    if (!videoId || !account) {
      throw new ExtractorError('Unable to get the required video data', { expected: true });
    }

    return this.url_result(
      `https://players.brightcove.net/${account}/default_default/index.html?videoId=${videoId}`,
      'BrightcoveNew',
      videoId,
    );
  }
}
