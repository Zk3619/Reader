/** PiaproIE — ported from yt-dlp piapro.py (login omitted) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, get_element_by_class, parse_duration, parse_filesize, str_to_int, unified_timestamp } from '../../utils';

export class PiaproIE extends InfoExtractor {
  static IE_NAME = 'piapro';
  static _VALID_URL = /https?:\/\/piapro\.jp\/(?:t|content)\/(?<id>[\w-]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const categoryId = this._search_regex(/categoryId=(.+)">/, webpage, 'category ID')!;
    if (!['1', '2', '21', '22', '23', '24', '25'].includes(categoryId)) {
      throw new ExtractorError('The URL does not contain audio.', { expected: true });
    }

    const extractInfo = (name: string, description: string): string | null =>
      this._search_regex(new RegExp(`${name}[：:]\\s*([\\d\\s,:/]+)\\s*</p>`), webpage, description, null, false);

    const creatorHtml = get_element_by_class('contents_creator', webpage) || '';
    return {
      id: videoId,
      title: clean_html(get_element_by_class('contents_title', webpage) || '') || undefined,
      description: clean_html(get_element_by_class('contents_description', webpage) || '') || undefined,
      uploader: clean_html(get_element_by_class('contents_creator_txt', webpage) || '') || undefined,
      uploader_id: this._search_regex(/<a\s+href="\/([^"]+)"/, creatorHtml, 'uploader id', null, false) ?? undefined,
      timestamp: unified_timestamp(extractInfo('投稿日', 'timestamp')) ?? undefined,
      duration: parse_duration(extractInfo('長さ', 'duration')) ?? undefined,
      view_count: str_to_int(extractInfo('閲覧数', 'view count')) ?? undefined,
      thumbnail: this._html_search_meta('twitter:image', webpage, null, false) ?? undefined,
      filesize_approx: parse_filesize((extractInfo('サイズ', 'size') || '').replace(/,/g, '')) ?? undefined,
      url: this._search_regex(/"url":\s*"(.*?)"/, webpage, 'url')!,
      ext: 'mp3',
      format_id: 'mp3',
      vcodec: 'none',
    };
  }
}
