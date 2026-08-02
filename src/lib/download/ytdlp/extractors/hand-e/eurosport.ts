/**
 * EurosportIE — ported from yt-dlp eurosport.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class EurosportIE extends InfoExtractor {
  static IE_NAME = 'eurosport';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:www|espanol)\.)?eurosport\.(?:com(?:\.tr)?|de|dk|es|fr|hu|it|nl|no|ro)|eurosport\.tvn24\.pl)\/[\w-]+\/(?:[\w-]+\/[\d-]+\/)?[\w.-]+_(?<id>vid\d+)/i;

  private static _token: string | null = null;

  async _real_initialize(): Promise<void> {
    if (EurosportIE._token == null) {
      const response = await this._download_json<{ data: { attributes: { token: string } } }>(
        'https://eu3-prod-direct.eurosport.com/token?realm=eurosport',
        undefined,
        'Trying to get token',
      );
      EurosportIE._token = response.data.attributes.token;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const jsonData = await this._download_json<{ data: Record<string, unknown> }>(
      `https://eu3-prod-direct.eurosport.com/playback/v2/videoPlaybackInfo/sourceSystemId/eurosport-${displayId}`,
      displayId,
      undefined,
      {
        query: { usePreAuth: 'true' },
        headers: { Authorization: `Bearer ${EurosportIE._token}` },
      },
    );

    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false });
    const streaming = traverse_obj(jsonData.data, ['attributes', 'streaming']) as Record<string, { url?: string }>;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const streamType of Object.keys(streaming || {})) {
      const streamUrl = streaming?.[streamType]?.url;
      if (!streamUrl) continue;
      if (streamType === 'hls') {
        const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, displayId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (streamType === 'dash') {
        formats.push(...(await this._extract_mpd_formats(streamUrl, displayId, 'dash', undefined, false)));
      }
    }

    return {
      id: String(jsonData.data.id ?? displayId),
      title: (jsonLd.title as string) || this._og_search_title(webpage) || displayId,
      display_id: displayId,
      formats,
      subtitles,
      description:
        (jsonLd.description as string) ||
        this._html_search_meta(['og:description', 'description'], webpage, undefined, false) ||
        undefined,
      duration: (jsonLd.duration as number) || undefined,
      timestamp: (jsonLd.uploadDate as string)
        ? Number(jsonLd.uploadDate)
        : ((jsonLd.timestamp as number) ?? undefined),
      thumbnail: ((jsonLd.thumbnailUrl as string) || this._og_search_thumbnail(webpage)) ?? undefined,
    };
  }
}
