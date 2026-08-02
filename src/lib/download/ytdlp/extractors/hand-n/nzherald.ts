/** NZHeraldIE — ported from yt-dlp nzherald.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, traverse_obj } from '../../utils';

export class NZHeraldIE extends InfoExtractor {
  static IE_NAME = 'nzherald';
  static _VALID_URL = /https?:\/\/(?:www\.)?nzherald\.co\.nz\/[\w/-]+\/(?<id>[A-Z0-9]+)/;

  protected static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/1308227299001/S1BXZn8t_default/index.html?videoId=%s';

  protected _extractBcEmbedUrl(webpage: string): string | null {
    const m =
      webpage.match(/players\.brightcove\.net\/[^"']+/) ||
      webpage.match(/"embedUrl"\s*:\s*"(https?:\/\/players\.brightcove\.net[^"]+)"/);
    return m ? (m[0].startsWith('http') ? m[0] : m[1] || null) : null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    let bcUrl = this._extractBcEmbedUrl(webpage);

    if (!bcUrl) {
      const fusionRaw = this._search_regex(/Fusion\.globalContent\s*=\s*(\{.+?\})\s*;/, webpage, 'fusion metadata');
      const fusionMetadata = this._parse_json<Record<string, unknown>>(fusionRaw, articleId)!;
      let videoMetadata = fusionMetadata.video as Record<string, unknown> | undefined;
      if (!videoMetadata) {
        const customVideoId = traverse_obj(fusionMetadata, ['customVideo', 'embed', 'id']) as string | undefined;
        if (customVideoId) {
          videoMetadata = await this._download_json<Record<string, unknown>>(
            'https://www.nzherald.co.nz/pf/api/v3/content/fetch/full-content-by-id',
            articleId,
            undefined,
            { query: { query: JSON.stringify({ id: customVideoId, site: 'nzh' }), _website: 'nzh' } },
          );
        }
      }
      const bcVideoId =
        str_or_none((videoMetadata || fusionMetadata).brightcoveId) ||
        str_or_none(
          ((fusionMetadata.content_elements as Array<{ referent?: { id?: string } }>) || [])
            .map((e) => e.referent?.id)
            .find(Boolean),
        );
      if (!bcVideoId) {
        if (videoMetadata && Object.keys(videoMetadata).length === 0) {
          throw new ExtractorError('This article does not have a video.', { expected: true });
        }
        throw new ExtractorError('Failed to extract brightcove video id', { expected: true });
      }
      bcUrl = NZHeraldIE.BRIGHTCOVE_URL_TEMPLATE.replace('%s', bcVideoId);
    }

    return this.url_result(bcUrl, 'BrightcoveNew');
  }
}
