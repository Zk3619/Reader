/**
 * AitubeKZVideoIE — aligned with yt-dlp aitube.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, merge_dicts } from '../../utils';
import { extractM3u8FormatsAndSubtitles, searchNextjsData } from './_helpers';

export class AitubeKZVideoIE extends InfoExtractor {
  static IE_NAME = 'aitubekzvideo';
  static _VALID_URL = /https?:\/\/aitube\.kz\/(?:video|embed\/)\?(?:[^\?]+)?id=(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageProps = searchNextjsData(this, webpage, videoId);
    const nextjsData = ((pageProps.pageProps as Record<string, unknown>)?.videoInfo ||
      {}) as Record<string, unknown>;
    const jsonLdData = this._search_json_ld(webpage, videoId, { fatal: false });

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `https://api-http.aitube.kz/kz.aitudala.aitube.staticaccess/video/${videoId}/video`,
      videoId,
    );

    const merged = merge_dicts(
      {
        id: videoId,
        title:
          (nextjsData.title as string | undefined) ||
          this._html_search_meta(['name', 'og:title'], webpage) ||
          videoId,
        description: nextjsData.description as string | undefined,
        formats,
        subtitles: subtitles as Record<string, Subtitle[]>,
        view_count:
          int_or_none(nextjsData.viewCount) ??
          int_or_none(this._html_search_meta('ya:ovs:views_total', webpage)) ??
          undefined,
        like_count: int_or_none(nextjsData.likeCount) ?? undefined,
        channel: nextjsData.channelTitle as string | undefined,
        channel_id: nextjsData.channelId as string | undefined,
        thumbnail: nextjsData.coverUrl as string | undefined,
        comment_count: int_or_none(nextjsData.commentCount) ?? undefined,
        channel_follower_count: int_or_none(nextjsData.channelSubscriberCount) ?? undefined,
        webpage_url: url,
        original_url: url,
        extractor: 'aitubekzvideo',
        extractor_key: 'AitubeKZVideo',
      },
      jsonLdData as Record<string, unknown>,
    );

    return merged as VideoInfo;
  }
}
