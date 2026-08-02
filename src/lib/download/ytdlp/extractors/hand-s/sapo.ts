/** SapoIE — ported from yt-dlp sapo.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { parse_duration, unified_strdate } from '../../utils';

const MRSS = 'http://videos.sapo.pt/mrss/';
const YAHOO = 'http://search.yahoo.com/mrss/';

export class SapoIE extends InfoExtractor {
  static IE_NAME = 'sapo';
  static IE_DESC = 'SAPO Vídeos';
  static _VALID_URL = /https?:\/\/(?:(?:v2|www)\.)?videos\.sapo\.(?:pt|cv|ao|mz|tl)\/(?<id>[\da-zA-Z]{20})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const xml = await this._download_webpage(`http://rd3.videos.sapo.pt/${videoId}/rss2`, videoId);
    const itemMatch = /<item>([\s\S]*?)<\/item>/i.exec(xml);
    if (!itemMatch) throw new Error('No RSS item');
    const item = itemMatch[1]!;

    const tag = (name: string, ns = MRSS) => {
      const re = new RegExp(`<(?:${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?${name}[^>]*>([^<]*)`, 'i');
      return re.exec(item)?.[1]?.trim();
    };
    const attr = (name: string, ns = YAHOO) => {
      const re = new RegExp(`<(?:${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?${name}[^>]+url=["']([^"']+)`, 'i');
      return re.exec(item)?.[1];
    };

    const title = tag('title', '') || videoId;
    const description = tag('synopse');
    const thumbnail = attr('content');
    const duration = parse_duration(tag('time')) ?? undefined;
    const uploader = tag('author');
    const pubDate = tag('pubDate', '');
    const upload_date = unified_strdate(pubDate) ?? undefined;
    const view_count = parseInt(tag('views') || '0', 10);
    const comment_count = parseInt(tag('comment_count') || '0', 10);
    const tags = tag('tags');
    const categories = tags ? tags.split(/\s+/) : [];
    const age_limit = tag('m18') === 'true' ? 18 : 0;

    const videoUrl = tag('videoFile');
    const videoSize = (tag('videoSize') || '0x0').split('x');
    const formats: Format[] = [
      {
        url: videoUrl!,
        ext: 'mp4',
        format_id: 'sd',
        width: parseInt(videoSize[0] || '0', 10),
        height: parseInt(videoSize[1] || '0', 10),
      },
    ];
    if (tag('HD') === 'true') {
      formats.push({
        url: videoUrl!.replace(/\/mov\/1$/, '/mov/39'),
        ext: 'mp4',
        format_id: 'hd',
        width: 1280,
        height: 720,
      });
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      duration,
      uploader,
      upload_date,
      view_count,
      comment_count,
      categories,
      age_limit,
      formats,
    };
  }
}
