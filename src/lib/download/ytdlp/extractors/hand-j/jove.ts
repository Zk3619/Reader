/**
 * JoveIE — ported from yt-dlp jove.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, unified_strdate } from '../../utils';

export class JoveIE extends InfoExtractor {
  static IE_NAME = 'jove';
  static _VALID_URL = /https?:\/\/(?:www\.)?jove\.com\/video\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const chaptersId = this._html_search_regex(/\/video-chapters\?videoid=([0-9]+)/, webpage, 'chapters id')!;
    const chaptersXml = await this._download_webpage(
      `http://www.jove.com/video-chapters?videoid=${chaptersId}`,
      videoId,
      'Downloading chapters XML',
      { fatal: false },
    );

    const videoUrl =
      /<[^>]+\bvideo=["']([^"']+)["']/.exec(chaptersXml)?.[1] ||
      /\bvideo=["']([^"']+)["']/.exec(chaptersXml)?.[1];
    if (!videoUrl) {
      throw new ExtractorError('Failed to get the video URL');
    }

    const title = this._html_search_meta('citation_title', webpage, 'title') ?? undefined;
    const thumb = this._og_search_thumbnail(webpage);
    const description = this._html_search_regex(
      /<div id="section_body_summary"><p class="jove_content">(.+?)<\/p>/,
      webpage,
      'description',
      null,
      false,
    );
    const publishDate = unified_strdate(
      this._html_search_meta('citation_publication_date', webpage, 'publish date', false),
    );
    const commentCount = int_or_none(
      this._html_search_regex(/<meta name="num_comments" content="(\d+) Comments?"/, webpage, 'comment count', null, false),
    );

    return {
      id: videoId,
      title,
      url: videoUrl,
      ext: 'mp4',
      thumbnail: thumb ?? undefined,
      description: description ?? undefined,
      upload_date: publishDate ?? undefined,
      comment_count: commentCount ?? undefined,
    };
  }
}
