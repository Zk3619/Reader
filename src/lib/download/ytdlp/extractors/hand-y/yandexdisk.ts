// @ts-nocheck
/** YandexDiskIE â€?ported from yt-dlp yandexdisk.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  try_get,
} from '../../utils';
import { urljoin } from './_helpers';

export class YandexDiskIE extends InfoExtractor {
  static IE_NAME = 'YandexDisk';
  static _VALID_URL =
    /https?:\/\/(?<domain>yadi\.sk|disk\.(?:360\.)?yandex\.(?:az|by|co(?:m(?:\.(?:am|ge|tr))?|\.il)|ee|fr|k[gz]|l[tv]|md|t[jm]|u[az]|ru))\/(?:[di]\/|public.*?\bhash=)(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    let videoId = m.groups!.id!;

    const webpage = await this._download_webpage(url, videoId);
    const storeRaw = this._search_regex(
      /<script[^>]+id="store-prefetch"[^>]*>\s*(\{.+?\})\s*<\/script>/,
      webpage,
      'store',
    );
    const store = this._parse_json(storeRaw!, videoId) as Record<string, unknown>;
    const resources = store.resources as Record<string, Record<string, unknown>>;
    const resource = resources[String(store.rootResourceId)]!;

    const title = String(resource.name || videoId);
    const meta = (resource.meta as Record<string, unknown>) || {};

    const publicUrl = meta.short_url != null ? String(meta.short_url) : null;
    if (publicUrl) {
      try {
        videoId = this._match_id(publicUrl);
      } catch {
        /* keep */
      }
    }

    let sourceUrl = (
      (await this._download_json<{ href?: string }>(
        'https://cloud-api.yandex.net/v1/disk/public/resources/download',
        videoId,
        undefined,
        { query: { public_key: url }, fatal: false },
      )) || {}
    ).href;

    let videoStreams = (resource.videoStreams as Record<string, unknown>) || {};
    const videoHash = resource.hash != null ? String(resource.hash) : url;
    const environment = (store.environment as Record<string, unknown>) || {};
    const sk = environment.sk;
    const yandexuid = environment.yandexuid;

    if (sk && yandexuid && !(sourceUrl && Object.keys(videoStreams).length)) {
      // Cookie set skipped (no _set_cookie); still attempt public API
      const callApi = async (action: string): Promise<Record<string, unknown>> => {
        const resp =
          (await this._download_json<{ data?: Record<string, unknown> }>(
            urljoin(url, `/public/api/${action}`),
            videoId,
            undefined,
            {
              data: JSON.stringify({ hash: videoHash, sk }),
              headers: { 'Content-Type': 'text/plain' },
              fatal: false,
            },
          )) || {};
        return resp.data || {};
      };
      if (!sourceUrl) {
        sourceUrl = (await callApi('download-url')).url as string | undefined;
      }
      if (!Object.keys(videoStreams).length) {
        videoStreams = await callApi('get-video-streams');
      }
    }

    const formats: Format[] = [];
    if (sourceUrl) {
      formats.push({
        url: sourceUrl,
        format_id: 'source',
        ext: determine_ext(
          title,
          (meta.ext as string) || mimetype2ext(meta.mime_type as string) || 'mp4',
        ),
        quality: 1,
        filesize: int_or_none(meta.size) ?? undefined,
      });
    }

    for (const video of (videoStreams.videos as Array<Record<string, unknown>>) || []) {
      const formatUrl = video.url != null ? String(video.url) : null;
      if (!formatUrl) continue;
      if (video.dimension === 'adaptive') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else {
        const size = (video.size as Record<string, unknown>) || {};
        const height = int_or_none(size.height);
        formats.push({
          ext: 'mp4',
          format_id: height != null ? `hls-${height}p` : 'hls',
          height: height ?? undefined,
          protocol: 'm3u8_native',
          url: formatUrl,
          width: int_or_none(size.width) ?? undefined,
        });
      }
    }

    const uid = resource.uid != null ? String(resource.uid) : undefined;
    const displayName = try_get(store, (x) =>
      String(
        ((x.users as Record<string, Record<string, unknown>>)[uid || ''] || {}).displayName || '',
      ),
    );

    return {
      id: videoId,
      title,
      duration: float_or_none(videoStreams.duration, 1000) ?? undefined,
      uploader: displayName || undefined,
      uploader_id: uid,
      view_count: int_or_none(meta.views_counter) ?? undefined,
      formats,
    };
  }
}
