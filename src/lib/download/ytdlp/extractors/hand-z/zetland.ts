// @ts-nocheck
/** ZetlandDKArticleIE â€?ported from yt-dlp zetland.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { merge_dicts, traverse_obj, unified_timestamp, url_or_none } from '../../utils';

export class ZetlandDKArticleIE extends InfoExtractor {
  static IE_NAME = 'zetland:dk:article';
  static _VALID_URL =
    /https?:\/\/www\.zetland\.dk\/\w+\/(?<id>(?<story_id>\w{8})-(?<uploader_id>\w{8})-(?:\w{5}))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const displayId = m?.groups?.id || this._match_id(url);
    const uploaderId = m?.groups?.uploader_id || undefined;
    const webpage = await this._download_webpage(url, displayId);

    const nextData = this._search_nextjs_data(webpage, displayId) as Record<string, any>;
    const pageProps = (((nextData.props || {}) as Record<string, any>).pageProps || {}) as Record<string, any>;
    const storyData =
      (traverse_obj(pageProps, ['initialState', 'consume', 'story', 'story']) as Record<string, any>) || {};

    const formats: Format[] = [];
    const audioFiles =
      (traverse_obj(storyData, ['story_content', 'meta', 'audioFiles']) as Array<unknown>) || [];
    for (const audioUrl of audioFiles) {
      const u = url_or_none(audioUrl);
      if (!u) continue;
      formats.push({ url: u, vcodec: 'none' });
    }

    const fromStory = {
      title:
        (traverse_obj(storyData, ['story_content', 'content', 'title']) as string) ||
        (traverse_obj(storyData, ['title']) as string) ||
        undefined,
      uploader: (traverse_obj(storyData, ['sharer', 'name']) as string) || undefined,
      uploader_id: (traverse_obj(storyData, ['sharer', 'sharer_id']) as string) || undefined,
      description: (traverse_obj(storyData, ['story_content', 'content', 'socialDescription']) as string) || undefined,
      series_id: (traverse_obj(storyData, ['story_content', 'meta', 'seriesId']) as string) || undefined,
      release_timestamp: unified_timestamp(traverse_obj(storyData, ['published_at']) as string) || undefined,
      modified_timestamp: unified_timestamp(traverse_obj(storyData, ['revised_at']) as string) || undefined,
    };

    const ld = (traverse_obj(pageProps, ['metaInfo', 'ld']) as Record<string, any>) || {};
    const fallback = {
      title: this._html_search_meta(['title', 'og:title', 'twitter:title'], webpage, null, false) || undefined,
      description:
        this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage, null, false) || undefined,
      thumbnail: this._html_search_meta(['og:image', 'twitter:image'], webpage, null, false) || undefined,
      uploader: this._html_search_meta(['author'], webpage, null, false) || undefined,
      release_timestamp:
        unified_timestamp(this._html_search_meta(['article:published_time'], webpage, null, false) || '') || undefined,
    };

    return merge_dicts(
      {
        id: displayId,
        formats,
        uploader_id: uploaderId,
      },
      fromStory,
      {
        title: (ld.headline as string) || undefined,
        description: (ld.description as string) || undefined,
        uploader: (ld.author?.name as string) || undefined,
        uploader_url: url_or_none(ld.author?.url) || undefined,
        thumbnail: url_or_none(ld.image) || undefined,
        modified_timestamp: unified_timestamp(ld.dateModified as string) || undefined,
        release_timestamp: unified_timestamp(ld.datePublished as string) || undefined,
        timestamp: unified_timestamp(ld.dateCreated as string) || undefined,
      },
      fallback,
      this._search_json_ld(webpage, displayId, { fatal: false }) || {},
    ) as VideoInfo;
  }
}
