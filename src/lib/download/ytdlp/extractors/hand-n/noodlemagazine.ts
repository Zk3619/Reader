/** NoodleMagazineIE — ported from yt-dlp noodlemagazine.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_count, parse_duration, str_or_none, unified_strdate } from '../../utils';
import { urljoin } from './_helpers';

export class NoodleMagazineIE extends InfoExtractor {
  static IE_NAME = 'NoodleMagazine';
  static _VALID_URL = /https?:\/\/(?:www|adult\.)?noodlemagazine\.com\/watch\/(?<id>[0-9-_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._og_search_title(webpage);
    const duration = parse_duration(this._html_search_meta('video:duration', webpage) || undefined);
    const description = (this._og_search_property('description', webpage) || '')
      .replace(' watch online hight quality video', '');
    const tags = (this._html_search_meta('video:tag', webpage) || '').split(', ').filter(Boolean);
    const viewCount = parse_count(this._html_search_meta('ya:ovs:views_total', webpage) || undefined);
    const likeCount = parse_count(this._html_search_meta('ya:ovs:likes', webpage) || undefined);
    const uploadDate = unified_strdate(this._html_search_meta('ya:ovs:upload_date', webpage) || undefined);

    const buildUrl = (p: string) => urljoin('https://adult.noodlemagazine.com', p);
    const playlistInfo = this._search_json<Record<string, unknown>>(
      /window\.playlist\s*=/,
      webpage,
      'playlist info',
      videoId,
    )!;

    const formats: Format[] = [];
    for (const source of (playlistInfo.sources as Array<Record<string, unknown>>) || []) {
      if (!source.file) continue;
      if (source.type === 'hls') {
        formats.push(
          ...(await this._extract_m3u8_formats(buildUrl(String(source.file)), videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else {
        formats.push({
          url: buildUrl(String(source.file)),
          format_id: str_or_none(source.label) || 'http',
          height: int_or_none(source.label) ?? undefined,
          ext: String(source.type || 'mp4'),
        });
      }
    }

    return {
      id: videoId,
      formats,
      title,
      thumbnail:
        this._og_search_property('image', webpage) ||
        str_or_none(playlistInfo.image) ||
        undefined,
      duration: duration ?? undefined,
      description: description || undefined,
      tags: tags.length ? tags : undefined,
      view_count: viewCount ?? undefined,
      like_count: likeCount ?? undefined,
      upload_date: uploadDate ?? undefined,
      age_limit: 18,
    };
  }
}