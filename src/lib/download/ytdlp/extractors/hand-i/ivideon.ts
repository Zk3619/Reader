/**
 * IvideonIE — ported from yt-dlp ivideon.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

const QUALITIES = ['low', 'mid', 'hi'] as const;

function qualityIndex(formatId: string): number {
  const idx = QUALITIES.indexOf(formatId as (typeof QUALITIES)[number]);
  return idx >= 0 ? idx : -1;
}

export class IvideonIE extends InfoExtractor {
  static IE_NAME = 'ivideon';
  static IE_DESC = 'Ivideon TV';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ivideon\.com\/tv\/(?:[^/]+\/)*camera\/(?<id>\d+-[\da-f]+)\/(?<camera_id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const serverId = m.groups!.id!;
    const cameraId = m.groups!.camera_id!;
    const cameraUrl = new URL(`/tv/camera/${serverId}/${cameraId}/`, url).toString();

    let cameraName: string | undefined;
    let description: string | undefined;

    const webpage = await this._download_webpage(cameraUrl, serverId, undefined, { fatal: false });
    if (webpage) {
      const configString = this._search_regex(
        /var\s+config\s*=\s*(\{.+?\});/,
        webpage,
        'config',
        null,
        false,
      );
      if (configString) {
        const config = this._parse_json<Record<string, unknown>>(configString, serverId, null, false);
        const cameraInfo = (config?.ivTvAppOptions as Record<string, unknown> | undefined)?.currentCameraInfo as
          | Record<string, unknown>
          | undefined;
        if (cameraInfo) {
          cameraName = cameraInfo.camera_name != null ? String(cameraInfo.camera_name) : undefined;
          const misc = cameraInfo.misc as Record<string, unknown> | undefined;
          description = misc?.description != null ? String(misc.description) : undefined;
        }
      }
      if (!cameraName) {
        cameraName =
          this._html_search_meta('name', webpage, 'camera name', false) ||
          this._search_regex(/<h1[^>]+class="b-video-title"[^>]*>([^<]+)/, webpage, 'camera name', null, false) ||
          undefined;
      }
    }

    const formats: Format[] = QUALITIES.map((formatId) => ({
      url: `https://streaming.ivideon.com/flv/live?${new URLSearchParams({
        server: serverId,
        camera: cameraId,
        sessionId: 'demo',
        q: String(qualityIndex(formatId)),
      }).toString()}`,
      format_id: formatId,
      ext: 'flv',
      quality: qualityIndex(formatId),
    }));

    return {
      id: serverId,
      title: cameraName || serverId,
      description,
      is_live: true,
      formats,
    };
  }
}
