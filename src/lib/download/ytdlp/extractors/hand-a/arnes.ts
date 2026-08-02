/**
 * ArnesIE — aligned with yt-dlp arnes.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none, remove_start } from '../../utils';
import { parseIso8601 } from './helpers';

export class ArnesIE extends InfoExtractor {
  static IE_NAME = 'video.arnes.si';
  static IE_DESC = 'Arnes Video';
  static _VALID_URL =
    /https?:\/\/video\.arnes\.si\/(?:[a-z]{2}\/)?(?:watch|embed|api\/(?:asset|public\/video))\/(?<id>[0-9a-zA-Z]{12})/i;

  private static BASE_URL = 'https://video.arnes.si';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const payload = await this._download_json<{ data?: Record<string, unknown> }>(
      `${ArnesIE.BASE_URL}/api/public/video/${videoId}`,
      videoId,
    );
    const video = payload.data || {};

    const formats: Format[] = [];
    for (const media of (video.media as Record<string, unknown>[]) || []) {
      const mediaUrl = media.url != null ? String(media.url) : '';
      if (!mediaUrl) continue;
      formats.push({
        url: `${ArnesIE.BASE_URL}${mediaUrl}`,
        format_id: remove_start(String(media.format || ''), 'FORMAT_') || 'http',
        format_note: media.formatTranslation != null ? String(media.formatTranslation) : undefined,
        width: int_or_none(media.width) ?? undefined,
        height: int_or_none(media.height) ?? undefined,
      });
    }

    const channel = (video.channel as Record<string, unknown>) || {};
    const channelId = channel.url != null ? String(channel.url) : undefined;
    const thumb = video.thumbnailUrl != null ? `${ArnesIE.BASE_URL}${video.thumbnailUrl}` : undefined;
    const startTime = int_or_none(new URL(url).searchParams.get('t'));

    return {
      id: videoId,
      title: String(video.title || videoId),
      formats,
      thumbnail: thumb,
      description: video.description != null ? String(video.description) : null,
      license: video.license != null ? String(video.license) : undefined,
      creator: video.author != null ? String(video.author) : undefined,
      timestamp: parseIso8601(video.creationTime) ?? undefined,
      channel: channel.name != null ? String(channel.name) : undefined,
      channel_id: channelId,
      channel_url: channelId ? `${ArnesIE.BASE_URL}/?channel=${channelId}` : undefined,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      view_count: int_or_none(video.views) ?? undefined,
      tags: video.hashtags as string[] | undefined,
      start_time: startTime ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'video.arnes.si',
      extractor_key: 'Arnes',
    };
  }
}
