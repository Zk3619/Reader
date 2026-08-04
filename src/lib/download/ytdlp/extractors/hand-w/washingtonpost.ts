// @ts-nocheck
/** WashingtonPostIE / WashingtonPostArticleIE â€?ported from yt-dlp washingtonpost.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { searchNextjsData } from './_helpers';

export class WashingtonPostIE extends InfoExtractor {
  static IE_NAME = 'washingtonpost';
  static _VALID_URL =
    /(?:washingtonpost:|https?:\/\/(?:www\.)?washingtonpost\.com\/(?:video|posttv)\/(?:[^/]+\/)*)(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/;
  static _EMBED_REGEX = [
    /<iframe[^>]+\bsrc=["'](?<url>https?:\/\/(?:www\.)?washingtonpost\.com\/video\/c\/embed\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`arcpublishing:wapo:${videoId}`, 'ArcPublishing', videoId);
  }
}

export class WashingtonPostArticleIE extends InfoExtractor {
  static IE_NAME = 'washingtonpost:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?washingtonpost\.com\/(?:[^/]+\/)*(?<id>[^/?#]+)/;

  static suitable(url: string): boolean {
    return WashingtonPostIE.suitable(url) ? false : super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const title = this._og_search_title(webpage) || pageId;

    const uuids = [
      ...webpage.matchAll(
        /(?:<div\s+class="posttv-video-embed[^>]*?data-uuid=|data-video-uuid=)"([^"]+)"/g,
      ),
    ].map((m) => m[1]!).filter(Boolean);

    if (!uuids.length) {
      const jsonData = searchNextjsData(this, webpage, pageId);
      const elements =
        (traverse_obj(jsonData, ['pageProps', 'globalContent', 'content_elements']) as Array<
          Record<string, unknown>
        >) || [];
      for (const contentElement of elements) {
        if (contentElement.type === 'video' && contentElement._id) {
          uuids.push(String(contentElement._id));
        }
      }
    }

    const entries = uuids.map((uuid) =>
      this.url_result(`washingtonpost:${uuid}`, 'WashingtonPost', uuid),
    );

    return {
      _type: 'playlist',
      entries,
      id: pageId,
      title,
    };
  }
}
