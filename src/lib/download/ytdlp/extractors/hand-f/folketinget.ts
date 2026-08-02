/**
 * FolketingetIE ??ported from yt-dlp folketinget.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, parse_qs } from '../../utils';
import { parseIso8601, xmlTagText } from './_helpers';

export class FolketingetIE extends InfoExtractor {
  static IE_DESC = 'Folketinget (ft.dk; Danish parliament)';
  static IE_NAME = 'folketinget';
  static _VALID_URL = /https?:\/\/(?:www\.)?ft\.dk\/webtv\/video\/[^?#]*?\.(?<id>[0-9]+)\.aspx/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._og_search_title(webpage) || videoId;
    const description = this._html_search_regex(
      /<div class="video-item-agenda"[^>]*>([\s\S]*?)<\//,
      webpage,
      'description',
      null,
      false,
    );

    const embedMatch = webpage.match(
      /<embed src="http:\/\/ft\.arkena\.tv\/flash\/ftplayer\.swf\?([^"]+)"/,
    );
    const playerParams = parse_qs(`?${embedMatch?.[1] || ''}`);
    const xmlUrl = playerParams.xml?.[0] || '';
    const doc = await this._download_webpage(xmlUrl, videoId, 'Downloading video XML');

    const timestamp = parseIso8601(xmlTagText(doc, 'date') || undefined) ?? undefined;
    const duration = parse_duration(xmlTagText(doc, 'duration') || undefined) ?? undefined;
    const width = int_or_none(xmlTagText(doc, 'width') || undefined) ?? undefined;
    const height = int_or_none(xmlTagText(doc, 'height') || undefined) ?? undefined;
    const viewCount = int_or_none(xmlTagText(doc, 'views') || undefined) ?? undefined;

    const formats: Format[] = [];
    for (const streamMatch of doc.matchAll(/<stream\b[^>]*bitrate="([^"]+)"[^>]*>([\s\S]*?)<\/stream>/gi)) {
      const streamUrl = xmlTagText(streamMatch[0], 'url');
      if (!streamUrl) continue;
      formats.push({
        format_id: streamMatch[1],
        url: streamUrl,
        tbr: int_or_none(streamMatch[1]) ?? undefined,
      });
    }

    return {
      id: videoId,
      title,
      formats,
      description: description ?? undefined,
      timestamp,
      width,
      height,
      duration,
      view_count: viewCount,
    };
  }
}
