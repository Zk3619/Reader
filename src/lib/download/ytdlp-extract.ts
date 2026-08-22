/**
 * ytdlp extract_info 封装：供 service 创建任务与 queue 失败重试共用（避免 service↔queue 循环依赖）。
 */

import type { DownloadTask, ResolveResult } from '@/lib/download/task-model';
import { YoutubeDL } from '@/lib/download/ytdlp';
import { logDownloadError } from '@/lib/download/error-message';

export async function extractInfoYtdlp(
  url: string,
  opts?: { format?: string },
): Promise<ResolveResult | null> {
  try {
    const ydl = new YoutubeDL({
      quiet: true,
      noplaylist: true,
      format: opts?.format?.trim() || 'bv*+ba/b',
    });
    const info = await ydl.extract_info(url, false);
    if (!info) return { name: url, size: 0, protocol: 'ytdlp' };
    const entries = Array.isArray(info.entries) ? info.entries : undefined;
    const files = entries?.map((e, i) => {
      const row = (e ?? {}) as Record<string, unknown>;
      return {
        name: String(row.title || row.id || `entry-${i + 1}`),
        size: Number(row.filesize ?? row.filesize_approx ?? 0) || 0,
        selected: true,
      };
    });
    const formats = Array.isArray(info.formats) ? info.formats : [];
    const durationSec = Number(info.duration) || 0;
    const formatBytes = (f: { filesize?: unknown; filesize_approx?: unknown; tbr?: unknown }) => {
      const direct = Number(f.filesize ?? f.filesize_approx ?? 0) || 0;
      if (direct > 0) return direct;
      const tbr = Number(f.tbr ?? 0) || 0;
      if (tbr > 0 && durationSec > 0) return Math.round((tbr * 1000 * durationSec) / 8);
      return 0;
    };
    const bestSize = formats.reduce((max, f) => Math.max(max, formatBytes(f)), 0);
    const requested = Array.isArray(info.requested_formats)
      ? info.requested_formats
      : info.url
        ? [
            {
              format_id: info.format_id,
              url: info.url,
              ext: info.ext,
              protocol: info.protocol,
              http_headers: info.http_headers,
            },
          ]
        : [];
    const requestedSize = requested.reduce(
      (sum, f) =>
        sum + formatBytes(f as { filesize?: unknown; filesize_approx?: unknown; tbr?: unknown }),
      0,
    );
    const hasMediaUrl =
      requested.some((f) => !!(f as { url?: string }).url) ||
      formats.some((f) => !!f.url) ||
      !!info.url;
    if (!hasMediaUrl && !entries?.length) {
      throw new Error('未能解析到可下载的视频地址');
    }
    return {
      name: String(info.title || info.id || url),
      size: Number(info.filesize ?? info.filesize_approx ?? requestedSize ?? bestSize ?? 0) || 0,
      files,
      protocol: 'ytdlp',
      meta: {
        formats,
        thumbnails: info.thumbnails,
        subtitles: info.subtitles,
        automatic_captions: info.automatic_captions,
        formatId: info.format_id,
        requestedFormats: requested,
        http_headers: info.http_headers,
        title: info.title,
        description: info.description,
        uploader: info.uploader,
        extractor: info.extractor,
        duration: info.duration,
        ytdlpSource: 'builtin',
        suggestedFilename: info._filename,
        section_start: info.section_start,
        section_end: info.section_end,
        section_title: info.section_title,
        force_keyframes_at_cuts: info.force_keyframes_at_cuts,
        requested_downloads: info.requested_downloads,
        __downloader_options: info.__downloader_options,
        continuedl: (info.__downloader_options as { continuedl?: boolean } | undefined)?.continuedl,
        concurrent_fragment_downloads: (
          info.__downloader_options as { concurrent_fragment_downloads?: number } | undefined
        )?.concurrent_fragment_downloads,
        fragment_retries: (
          info.__downloader_options as { fragment_retries?: number } | undefined
        )?.fragment_retries,
        ratelimit: (info.__downloader_options as { ratelimit?: number } | undefined)?.ratelimit,
        http_chunk_size: (
          info.__downloader_options as { http_chunk_size?: number } | undefined
        )?.http_chunk_size,
        external_downloader: info.external_downloader,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDownloadError('ytdlp extract_info', e);
    throw new Error(`ytdlp extract_info failed: ${msg}`);
  }
}

/**
 * 失败重试前刷新短时签名直链（如 googlevideo）。
 * 尽量按原 format_id 对齐；对不上则沿用本次 extract 的 bv*+ba 结果。
 */
export async function refreshYtdlpMediaMeta(
  url: string,
  prevMeta?: DownloadTask['meta'] | null,
): Promise<DownloadTask['meta']> {
  const resolved = await extractInfoYtdlp(url);
  if (!resolved?.meta) {
    throw new Error('重新解析失败：未获取到媒体信息');
  }
  const next = { ...resolved.meta } as DownloadTask['meta'];
  const formats = Array.isArray(next.formats) ? next.formats : [];
  const prevRequested = Array.isArray(prevMeta?.requestedFormats)
    ? prevMeta.requestedFormats
    : [];
  const prevIds = prevRequested
    .map((f) => String((f as { format_id?: string })?.format_id || '').trim())
    .filter(Boolean);

  if (prevIds.length > 0 && formats.length > 0) {
    const matched = prevIds.map((id) =>
      formats.find((f) => String((f as { format_id?: string }).format_id || '') === id),
    );
    if (
      matched.length === prevIds.length &&
      matched.every((f) => f && String((f as { url?: string }).url || ''))
    ) {
      next.requestedFormats = matched as typeof next.requestedFormats;
      next.formatId = prevIds.join('+');
    }
  }

  return next;
}
