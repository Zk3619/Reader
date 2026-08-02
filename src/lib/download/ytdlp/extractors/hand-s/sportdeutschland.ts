/** SportDeutschlandIE — ported from yt-dlp sportdeutschland.py */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { join_nonempty, traverse_obj, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, strip_or_none } from './_helpers';

export class SportDeutschlandIE extends InfoExtractor {
  static IE_NAME = 'sporteurope';
  static _VALID_URL = /https?:\/\/(?:player\.)?sporteurope\.tv\/(?<id>(?:[^/?#]+\/)?[^?#/&]+)/;

  protected async _processVideo(
    assetId: string,
    video: Record<string, unknown>,
  ): Promise<Partial<VideoInfo>> {
    const isLive = video.type === 'mux_live';
    const token = (
      await this._download_json<{ token?: string }>(
        `https://api.sporteurope.tv/api/web/personal/asset-token/${assetId}`,
        String(video.id),
        undefined,
        {
          query: { type: String(video.type), playback_id: String(video.src) },
          headers: { Referer: 'https://sporteurope.tv/' },
        },
      )
    ).token!;
    const res = await extractM3u8FormatsAndSubtitles(
      this,
      `https://stream.mux.com/${video.src}.m3u8?token=${token}`,
      String(video.id),
      'hls',
    );
    const durationRaw = video.duration;
    const duration =
      typeof durationRaw === 'number' && durationRaw > 0 ? durationRaw : undefined;
    return {
      is_live: isLive,
      formats: res.formats,
      subtitles: res.subtitles as Record<string, Subtitle[]>,
      id: String(video.id),
      duration,
      timestamp: unified_timestamp(video.created_at) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const meta = await this._download_json<Record<string, unknown>>(
      `https://api.sporteurope.tv/api/stateless/frontend/assets/${displayId}`,
      displayId,
      undefined,
      { query: { access_token: 'true' } },
    );
    const info: VideoInfo = {
      display_id: displayId,
      id: String(meta.id || meta.uuid || displayId),
      title: strip_or_none(meta.title || meta.name) || undefined,
      description: (meta.description as string) || undefined,
      channel: traverse_obj(meta, ['profile', 'name']) as string | undefined,
      channel_id: traverse_obj(meta, ['profile', 'id']) as string | undefined,
      is_live: meta.currently_live as boolean | undefined,
      was_live: meta.was_live as boolean | undefined,
      channel_url: traverse_obj(meta, ['profile', 'slug'])
        ? `https://sporteurope.tv/${traverse_obj(meta, ['profile', 'slug'])}`
        : undefined,
    };
    const parts =
      (meta.livestream as Record<string, unknown>[]) ||
      (meta.videos as Record<string, unknown>[]) ||
      [];
    const entries: VideoInfo[] = [];
    for (let i = 0; i < parts.length; i++) {
      const video = parts[i]!;
      entries.push({
        title: join_nonempty(info.title, `Part ${i + 1}`, ' ') || undefined,
        channel: info.channel,
        channel_id: info.channel_id,
        channel_url: info.channel_url,
        was_live: info.was_live,
        ...(await this._processVideo(String(info.id), video)),
      } as VideoInfo);
    }
    if (entries.length > 1) {
      return { ...info, _type: 'multi_video', entries };
    }
    return { ...info, ...entries[0], title: info.title };
  }
}
