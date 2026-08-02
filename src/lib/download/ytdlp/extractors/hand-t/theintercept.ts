/**
 * TheInterceptIE — ported from yt-dlp theintercept.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601 } from '../hand-a/helpers';

export class TheInterceptIE extends InfoExtractor {
  static IE_NAME = 'theintercept';
  static _VALID_URL = /https?:\/\/theintercept\.com\/fieldofvision\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const jsonData = this._parse_json<Record<string, unknown>>(
      this._search_regex(/initialStoreTree\s*=\s*(?<json_data>\{.+})/, webpage, 'initialStoreTree')!,
      displayId,
    )!;

    const posts = (jsonData.resources as Record<string, unknown>)?.posts as
      | Record<string, Record<string, unknown>>
      | undefined;
    for (const post of Object.values(posts || {})) {
      if (post.slug === displayId) {
        return {
          _type: 'url_transparent',
          url: `jwplatform:${post.fov_videoid}`,
          id: String(post.ID),
          display_id: displayId,
          title: post.title as string,
          description: (post.excerpt as string) || undefined,
          timestamp: parseIso8601(post.date as string) ?? undefined,
          comment_count: int_or_none(post.comments_number) ?? undefined,
          extractor: 'JWPlatform',
          extractor_key: 'JWPlatform',
        };
      }
    }
    throw new ExtractorError('Unable to find the current post', { expected: true });
  }
}
