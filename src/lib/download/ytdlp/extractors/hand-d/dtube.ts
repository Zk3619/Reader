/**
 * DTubeIE — ported from yt-dlp dtube.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class DTubeIE extends InfoExtractor {
  static IE_NAME = 'dtube';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?d\.tube\/(?:#!\/)?v\/(?<uploader_id>[0-9a-z.-]+)\/(?<id>[0-9a-z]{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const videoId = m.groups!.id!;

    const result = await this._download_json<{ result: Record<string, unknown> }>(
      'https://api.steemit.com/',
      videoId,
      undefined,
      {
        data: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get_content',
          params: [uploaderId, videoId],
        }),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    ).then((r) => r.result);

    const metadata = JSON.parse(String(result.json_metadata ?? '{}')) as Record<string, unknown>;
    const video = (metadata.video as Record<string, unknown>) || {};
    const content = (video.content as Record<string, unknown>) || {};
    const info = (video.info as Record<string, unknown>) || {};
    const title = (info.title as string) || String(result.title ?? videoId);

    const canonicalUrl = (h: string | undefined): string | null =>
      h ? `https://video.dtube.top/ipfs/${h}` : null;

    const formats: Format[] = [];
    for (const q of ['240', '480', '720', '1080', ''] as const) {
      const hashKey = q ? `video${q}hash` : 'videohash';
      const videoUrl = canonicalUrl(content[hashKey] as string | undefined);
      if (!videoUrl) continue;
      const formatId = q ? `${q}p` : 'Source';
      try {
        this.to_screen(`${videoId}: Checking ${formatId} video format URL`);
        await this._httpGetText(videoUrl, undefined, { method: 'HEAD' });
      } catch {
        this.to_screen(`${videoId}: ${formatId} URL is invalid, skipping`);
        continue;
      }
      formats.push({
        format_id: formatId,
        url: videoUrl,
        height: int_or_none(q) ?? undefined,
        ext: 'mp4',
      });
    }

    return {
      id: videoId,
      title,
      description: (content.description as string) ?? undefined,
      thumbnail: canonicalUrl(info.snaphash as string | undefined) ?? undefined,
      tags: (content.tags as string[]) || (metadata.tags as string[]) || undefined,
      duration: int_or_none(info.duration) ?? undefined,
      formats,
      timestamp: parseIso8601(result.created) ?? undefined,
      uploader_id: uploaderId,
    };
  }
}
