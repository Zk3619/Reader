// @ts-nocheck
/** ViddlerIE â€?ported from yt-dlp viddler.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none } from '../../utils';
import { protoRelative } from './_helpers';

export class ViddlerIE extends InfoExtractor {
  static IE_NAME = 'viddler';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?viddler\.com\/(?:v|embed|player)\/(?<id>[a-z0-9]+)(?:.+?\bsecret=(?<secret>\d+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const secret = m.groups!.secret;

    const query: Record<string, string> = {
      video_id: videoId,
      key: 'v0vhrt7bg2xq1vyxhkct',
    };
    if (secret) query.secret = secret;

    const data = (
      await this._download_json<{ video: Record<string, unknown> }>(
        'http://api.viddler.com/api/v2/viddler.videos.getPlaybackDetails.json',
        videoId,
        undefined,
        { headers: { Referer: url }, query },
      )
    ).video;

    const formats: Format[] = [];
    for (const filed of (data.files as Array<Record<string, unknown>>) || []) {
      if ((String(filed.status ?? 'ready')) !== 'ready') continue;
      const formatId = String(filed.profile_id || filed.profile_name || 'http');
      const base: Format = {
        format_id: formatId,
        format_note: filed.profile_name != null ? String(filed.profile_name) : undefined,
        url: protoRelative(String(filed.url || '')),
        width: int_or_none(filed.width) ?? undefined,
        height: int_or_none(filed.height) ?? undefined,
        filesize: int_or_none(filed.size) ?? undefined,
        ext: filed.ext != null ? String(filed.ext) : undefined,
        source_preference: -1,
      };
      formats.push(base);

      if (filed.cdn_url) {
        const cdn = String(filed.cdn_url);
        formats.push({
          ...base,
          url: cdn.startsWith('//') ? `http:${cdn}` : protoRelative(cdn),
          format_id: `${formatId}-cdn`,
          source_preference: 1,
        });
      }
      if (filed.html5_video_source) {
        formats.push({
          ...base,
          url: protoRelative(String(filed.html5_video_source)),
          format_id: `${formatId}-html5`,
          source_preference: 0,
        });
      }
    }

    const categories = ((data.tags as Array<Record<string, unknown>>) || [])
      .map((t) => (t.text != null ? String(t.text) : null))
      .filter(Boolean) as string[];

    return {
      id: videoId,
      title: String(data.title || videoId),
      formats,
      description: data.description != null ? String(data.description) : undefined,
      timestamp: int_or_none(data.upload_time) ?? undefined,
      thumbnail: data.thumbnail_url != null ? protoRelative(String(data.thumbnail_url)) : undefined,
      uploader: data.author != null ? String(data.author) : undefined,
      duration: float_or_none(data.length) ?? undefined,
      view_count: int_or_none(data.view_count) ?? undefined,
      comment_count: int_or_none(data.comment_count) ?? undefined,
      categories: categories.length ? categories : undefined,
    };
  }
}
