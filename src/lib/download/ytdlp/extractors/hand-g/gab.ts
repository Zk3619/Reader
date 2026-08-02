/**
 * GabIE — ported from yt-dlp gab.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_codecs,
  parse_duration,
  unified_timestamp,
} from '../../utils';

export class GabIE extends InfoExtractor {
  static IE_NAME = 'gab';
  static _VALID_URL = /https?:\/\/(?:www\.)?gab\.com\/[^/]+\/posts\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const postId = this._match_id(url);
    const jsonData = await this._download_json<Record<string, unknown>>(
      `https://gab.com/api/v1/statuses/${postId}`,
      postId,
    );

    const entries: VideoInfo[] = [];
    const mediaAttachments = (jsonData.media_attachments as Array<Record<string, unknown>>) || [];
    for (let idx = 0; idx < mediaAttachments.length; idx++) {
      const media = mediaAttachments[idx]!;
      const mediaType = media.type as string | undefined;
      if (mediaType !== 'video' && mediaType !== 'gifv') continue;

      const metadata = (media.meta as Record<string, unknown>) || {};
      const formatMetadata = {
        acodec: parse_codecs(metadata.audio_encode as string | undefined).acodec,
        asr: int_or_none(String(metadata.audio_bitrate ?? '').split(' ')[0]) ?? undefined,
        fps: metadata.fps as number | undefined,
      };

      const formats: Format[] = [];
      for (const [mediaUrl, f] of [
        [media.url, metadata.original],
        [media.source_mp4, metadata.playable],
      ] as const) {
        if (!mediaUrl) continue;
        const fmt = (f as Record<string, unknown>) || {};
        formats.push({
          format_id: mediaUrl === media.url ? 'original' : 'playable',
          url: String(mediaUrl),
          width: fmt.width as number | undefined,
          height: fmt.height as number | undefined,
          tbr: int_or_none(fmt.bitrate, 1000) ?? undefined,
          ...formatMetadata,
        });
      }

      const author = (jsonData.account as Record<string, unknown>) || {};
      const account = (jsonData.account as Record<string, unknown>) || {};
      entries.push({
        id: `${postId}-${idx}`,
        title: `${account.display_name} on Gab`,
        timestamp: unified_timestamp(jsonData.created_at) ?? undefined,
        formats,
        description: clean_html(String(jsonData.content ?? '')) ?? undefined,
        duration:
          (metadata.duration as number | undefined) ||
          parse_duration(metadata.length as string | undefined) ||
          undefined,
        like_count: int_or_none(jsonData.favourites_count) ?? undefined,
        comment_count: int_or_none(jsonData.replies_count) ?? undefined,
        repost_count: int_or_none(jsonData.reblogs_count) ?? undefined,
        uploader: author.username as string | undefined,
        uploader_id: author.id != null ? String(author.id) : undefined,
        uploader_url: author.url as string | undefined,
      });
    }

    if (entries.length > 1) return this.playlist_result(entries, postId);
    if (!entries.length) throw new ExtractorError('No video in this post', { expected: true });
    return entries[0]!;
  }
}
