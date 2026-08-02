/**
 * GolemIE — ported from yt-dlp golem.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { urljoin, xmlTagText } from './_helpers';

export class GolemIE extends InfoExtractor {
  static IE_NAME = 'golem';
  static _VALID_URL = /https?:\/\/video\.golem\.de\/.+?\/(?<id>.+?)\//;

  static _PREFIX = 'http://video.golem.de';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const config = await this._download_webpage(`https://video.golem.de/xml/${videoId}.xml`, videoId);

    const info: VideoInfo = {
      id: videoId,
      title: xmlTagText(config, 'title') || 'golem',
      duration: Number(xmlTagText(config, 'playtime')) || undefined,
      formats: [],
      thumbnails: [],
    };

    const formats: Format[] = [];
    for (const tagMatch of config.matchAll(/<(low|high|mobile|preview)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const tag = tagMatch[1]!;
      const attrs = tagMatch[2] || '';
      const body = tagMatch[3] || '';
      const streamUrl = xmlTagText(body, 'url');
      if (!streamUrl) continue;
      const heightMatch = /height="(\d+)"/.exec(attrs);
      const widthMatch = /width="(\d+)"/.exec(attrs);
      formats.push({
        format_id: tag,
        url: urljoin(GolemIE._PREFIX, streamUrl),
        height: heightMatch ? Number(heightMatch[1]) : undefined,
        width: widthMatch ? Number(widthMatch[1]) : undefined,
        filesize: Number(xmlTagText(body, 'filesize')) || undefined,
        ext: determine_ext(xmlTagText(body, 'filename') || ''),
      });
    }
    info.formats = formats;

    const thumbnails: Thumbnail[] = [];
    for (const teaserMatch of config.matchAll(/<teaser\b([^>]*)>([\s\S]*?)<\/teaser>/g)) {
      const attrs = teaserMatch[1] || '';
      const body = teaserMatch[2] || '';
      const thumbUrl = xmlTagText(body, 'url');
      if (!thumbUrl) continue;
      const heightMatch = /height="(\d+)"/.exec(attrs);
      const widthMatch = /width="(\d+)"/.exec(attrs);
      thumbnails.push({
        url: urljoin(GolemIE._PREFIX, thumbUrl),
        width: widthMatch ? Number(widthMatch[1]) : undefined,
        height: heightMatch ? Number(heightMatch[1]) : undefined,
      });
    }
    info.thumbnails = thumbnails;

    return info;
  }
}
