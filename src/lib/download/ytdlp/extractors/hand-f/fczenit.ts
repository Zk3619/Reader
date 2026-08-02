/**
 * FczenitIE ??ported from yt-dlp fczenit.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none } from '../../utils';

export class FczenitIE extends InfoExtractor {
  static IE_NAME = 'fczenit';
  static _VALID_URL = /https?:\/\/(?:www\.)?fc-zenit\.ru\/video\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const msiId = this._search_regex(
      /config\s*=\s*{[\s\S]+?video_id\s*:\s*'([^']+)'/s,
      webpage,
      'msi id',
    );

    const msiData = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        'http://player.fc-zenit.ru/msi/video',
        msiId!,
        undefined,
        { query: { video: msiId! } },
      )
    ).data!;
    const title = String(msiData.name ?? videoId);

    const qualities = (msiData.qualities as Array<Record<string, unknown>>) || [];
    const formats: Format[] = qualities
      .filter((q) => q.url)
      .map((q) => ({
        format_id: strOrUndef(q.label) || 'http',
        url: String(q.url),
        height: int_or_none(q.label) ?? undefined,
      }));

    const tags = ((msiData.tags as Array<Record<string, unknown>>) || [])
      .map((t) => t.label)
      .filter((l): l is string => typeof l === 'string');

    return {
      id: videoId,
      title,
      thumbnail: strOrUndef(msiData.preview),
      formats,
      duration: float_or_none(msiData.duration) ?? undefined,
      timestamp: int_or_none(msiData.date) ?? undefined,
      tags,
    };
  }
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
