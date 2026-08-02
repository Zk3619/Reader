/**
 * MixlrIE / MixlrRecoringIE — ported from yt-dlp mixlr.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class MixlrIE extends InfoExtractor {
  static IE_NAME = 'mixlr';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<username>[\w-]+)\.mixlr\.com\/events\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups?.username ?? '';
    const eventId = m.groups?.id ?? '';

    const broadcastInfo = await this._download_json<Record<string, unknown>>(
      `https://api.mixlr.com/v3/channels/${username}/events/${eventId}`,
      eventId,
    );

    const formats: Format[] = [];
    const included = (broadcastInfo.included as Array<Record<string, unknown>>) || [];
    const formatUrl = url_or_none(
      (included[0]?.attributes as Record<string, unknown> | undefined)?.progressive_stream_url,
    );
    if (formatUrl) {
      formats.push({ url: formatUrl, format_id: 'http', ext: 'mp3', vcodec: 'none' });
    }

    const releaseTimestampRaw = ((broadcastInfo.data as Record<string, unknown>)?.attributes as Record<string, unknown>)?.starts_at;
    const releaseTimestamp = parseIso8601(releaseTimestampRaw);
    if (!formats.length && releaseTimestampRaw) {
      this.raise_no_formats(`This event will start at ${releaseTimestampRaw}`, true);
    }

    const incAttrs = (included[0]?.attributes as Record<string, unknown>) || {};
    const dataAttrs = ((broadcastInfo.data as Record<string, unknown>)?.attributes as Record<string, unknown>) || {};

    return {
      id: eventId,
      uploader: username,
      formats,
      release_timestamp: releaseTimestamp ?? undefined,
      title: str_or_none(incAttrs.title) || str_or_none(dataAttrs.title) || undefined,
      description: str_or_none(dataAttrs.description) ?? undefined,
      timestamp: parseIso8601(incAttrs.started_at) ?? parseIso8601(dataAttrs.started_at) ?? undefined,
      concurrent_view_count:
        int_or_none(incAttrs.concurrent_view_count) ??
        int_or_none(dataAttrs.concurrent_view_count) ??
        undefined,
      like_count: int_or_none(incAttrs.heart_count) ?? int_or_none(dataAttrs.heart_count) ?? undefined,
      is_live: !!incAttrs.live || !!dataAttrs.live,
      thumbnail: url_or_none(dataAttrs.artwork_url) ?? undefined,
      uploader_id: str_or_none(dataAttrs.broadcaster_id) ?? undefined,
    };
  }
}

export class MixlrRecoringIE extends InfoExtractor {
  static IE_NAME = 'mixlr:recordings';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<username>[\w-]+)\.mixlr\.com\/recordings\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const username = m.groups?.username ?? '';
    const recordingId = m.groups?.id ?? '';

    const recordingInfo = await this._download_json<Record<string, unknown>>(
      `https://api.mixlr.com/v3/channels/${username}/recordings/${recordingId}`,
      recordingId,
    );
    const attrs = ((recordingInfo.data as Record<string, unknown>)?.attributes as Record<string, unknown>) || {};
    const streamUrl = url_or_none(attrs.url);
    const ext = str_or_none(attrs.file_format) || 'mp3';

    const formats: Format[] = streamUrl
      ? [{ url: streamUrl, format_id: ext, ext, vcodec: 'none' }]
      : [];

    return {
      id: recordingId,
      formats,
      title: str_or_none(attrs.title) ?? undefined,
      description: str_or_none(attrs.description) ?? undefined,
      timestamp: parseIso8601(attrs.created_at) ?? undefined,
      duration: int_or_none(attrs.duration) ?? undefined,
      thumbnail: url_or_none(attrs.artwork_url) ?? undefined,
      uploader_id: str_or_none(attrs.user_id) ?? undefined,
    };
  }
}
