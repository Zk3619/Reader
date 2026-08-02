/**
 * HuajiaoIE — ported from yt-dlp huajiao.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration } from '../../utils';
import { parseIso8601 } from './_helpers';

export class HuajiaoIE extends InfoExtractor {
  static IE_NAME = 'huajiao';
  static IE_DESC = 'Huajiao live';
  static _VALID_URL = /https?:\/\/(?:www\.)?huajiao\.com\/l\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const feedJson = this._search_regex(/var\s+feed\s*=\s*({.+})/, webpage, 'feed json');
    const feed = this._parse_json<Record<string, Record<string, unknown>>>(feedJson, videoId);
    if (!feed) throw new ExtractorError('Unable to parse feed json', { expected: true });

    const description = this._html_search_meta('description', webpage, 'description', false) ?? undefined;
    const feedSection = feed.feed || {};
    const author = feed.author || {};

    return {
      id: videoId,
      title: String(feedSection.formated_title ?? videoId),
      description,
      duration: parse_duration(feedSection.duration) ?? undefined,
      thumbnail: (feedSection.image as string | undefined) ?? undefined,
      timestamp: parseIso8601(String(feed.creatime ?? '').replace(' ', 'T')) ?? undefined,
      uploader: (author.nickname as string | undefined) ?? undefined,
      uploader_id: author.uid != null ? String(author.uid) : undefined,
      formats: await this._extract_m3u8_formats(
        String(feedSection.m3u8 ?? ''),
        videoId,
        'mp4',
        'm3u8_native',
      ),
    };
  }
}
