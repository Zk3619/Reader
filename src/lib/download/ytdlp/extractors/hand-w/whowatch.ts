// @ts-nocheck
/** WhoWatchIE â€?ported from yt-dlp whowatch.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, try_get } from '../../utils';
import { qualities, removeDuplicateFormats, try_call } from './_helpers';

export class WhoWatchIE extends InfoExtractor {
  static IE_NAME = 'whowatch';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/whowatch\.tv\/viewer\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    await this._download_webpage(url, videoId);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://api.whowatch.tv/lives/${videoId}`,
      videoId,
    );
    const liveData = await this._download_json<Record<string, unknown>>(
      `https://api.whowatch.tv/lives/${videoId}/play`,
      videoId,
    );

    const title =
      try_call(
        () => {
          const t = (liveData.share_info as { live_title?: string } | undefined)?.live_title;
          return typeof t === 'string' ? t.slice(1, -1) : undefined;
        },
        () => {
          const t = (metadata.live as { title?: string } | undefined)?.title;
          return typeof t === 'string' ? t : undefined;
        },
      ) || videoId;

    let hlsUrl = liveData.hls_url as string | undefined;
    if (!hlsUrl) {
      throw new ExtractorError(
        (liveData.error_message as string) || 'The user is offline.',
        { expected: true },
      );
    }

    const QUALITIES = qualities(['low', 'medium', 'high', 'veryhigh']);
    let formats: Format[] = [];

    for (const [i, fmtRaw] of ((liveData.streams as unknown[]) || []).entries()) {
      const fmt = fmtRaw as Record<string, unknown>;
      const name = String(fmt.quality || fmt.name || i);
      const streamHlsUrl = fmt.hls_url as string | undefined;
      const rtmpUrl = fmt.rtmp_url as string | undefined;
      const audioOnly = fmt.audio_only;
      const quality = QUALITIES(String(fmt.quality || ''));

      let hlsFmts: Format[] = [];
      if (streamHlsUrl) {
        hlsFmts = await this._extract_m3u8_formats(
          streamHlsUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          `hls-${name}`,
          undefined,
          false,
        );
        for (const f of hlsFmts) f.quality = quality;
        formats.push(...hlsFmts);
      }

      // RTMP url for audio_only is same as high format, so skip it
      if (rtmpUrl && !audioOnly) {
        formats.push({
          url: rtmpUrl,
          format_id: `rtmp-${name}`,
          ext: 'mp4',
          protocol: 'rtmp_ffmpeg',
          vcodec: 'h264',
          acodec: 'aac',
          quality,
          format_note: (fmt.label as string) || undefined,
          width: try_get(hlsFmts, (x) => (x as Format[])[0]?.width as number) as
            | number
            | undefined,
          height: try_get(hlsFmts, (x) => (x as Format[])[0]?.height as number) as
            | number
            | undefined,
        });
      }
    }

    // Fallback: same formats as above manifests
    formats.push(
      ...(await this._extract_m3u8_formats(
        hlsUrl,
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
    formats = removeDuplicateFormats(formats);

    let uploaderUrl = try_get(
      metadata,
      (x) =>
        ((x as { live?: { user?: { user_path?: string } } }).live?.user?.user_path as
          | string
          | undefined) || undefined,
    ) as string | undefined;
    if (uploaderUrl) {
      uploaderUrl = `https://whowatch.tv/profile/${uploaderUrl}`;
    }
    const uploaderId = strOrUndef(
      try_get(metadata, (x) => (x as { live?: { user?: { id?: number } } }).live?.user?.id),
    );
    const uploader = try_get(
      metadata,
      (x) => (x as { live?: { user?: { name?: string } } }).live?.user?.name,
    ) as string | undefined;
    const thumbnail = try_get(
      metadata,
      (x) =>
        (x as { live?: { latest_thumbnail_url?: string } }).live?.latest_thumbnail_url,
    ) as string | undefined;
    const timestamp = int_or_none(
      try_get(metadata, (x) => (x as { live?: { started_at?: number } }).live?.started_at),
      1000,
    );
    const viewCount = try_get(
      metadata,
      (x) => (x as { live?: { total_view_count?: number } }).live?.total_view_count,
    ) as number | undefined;
    const commentCount = try_get(
      metadata,
      (x) => (x as { live?: { comment_count?: number } }).live?.comment_count,
    ) as number | undefined;

    return {
      id: videoId,
      title,
      uploader_id: uploaderId,
      uploader_url: uploaderUrl,
      uploader,
      formats,
      thumbnail,
      timestamp: timestamp ?? undefined,
      view_count: viewCount,
      comment_count: commentCount,
      is_live: true,
    };
  }
}

function strOrUndef(v: unknown): string | undefined {
  if (v == null) return undefined;
  return String(v);
}
