/**
 * TruthIE — ported from yt-dlp truth.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, traverse_obj, unified_timestamp } from '../../utils';
import { format_field } from '../hand-g/_helpers';

function stripOrNone(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t || null;
}

export class TruthIE extends InfoExtractor {
  static IE_NAME = 'truth';
  static _VALID_URL = /https?:\/\/truthsocial\.com\/@[^/?#]+(?:\/posts)?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const status = await this._download_json<Record<string, unknown>>(
      `https://truthsocial.com/api/v1/statuses/${videoId}`,
      videoId,
    );
    const uploaderId = stripOrNone(traverse_obj(status, ['account', 'username']));
    const attachments = status.media_attachments as Array<Record<string, unknown>> | undefined;
    const mediaUrl = attachments?.[0]?.url as string | undefined;
    if (!mediaUrl) throw new Error('No media attachment');

    return {
      id: videoId,
      url: mediaUrl,
      title: '',
      description: stripOrNone(clean_html(status.content as string)) || undefined,
      timestamp: unified_timestamp(status.created_at) ?? undefined,
      uploader: stripOrNone(traverse_obj(status, ['account', 'display_name'])) || undefined,
      uploader_id: uploaderId || undefined,
      uploader_url: format_field({ id: uploaderId }, 'id', 'https://truthsocial.com/@%s') || undefined,
      repost_count: int_or_none(status.reblogs_count) ?? undefined,
      like_count: int_or_none(status.favourites_count) ?? undefined,
      comment_count: int_or_none(status.replies_count) ?? undefined,
    };
  }
}
