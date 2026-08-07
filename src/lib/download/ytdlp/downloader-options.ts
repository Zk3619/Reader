/**
 * Attach FD / orchestration options onto VideoInfo for engine-bridge meta.
 */

import type { VideoInfo, YoutubeDLOptions } from './types';

export interface YtdlpDownloaderOptions {
  ratelimit?: number;
  http_chunk_size?: number;
  continuedl?: boolean;
  concurrent_fragment_downloads?: number;
  fragment_retries?: number;
  sleep_interval?: number;
  max_sleep_interval?: number;
  hls_use_mpegts?: boolean;
  min_filesize?: number;
  max_filesize?: number;
  overwrites?: boolean;
  force_keyframes_at_cuts?: boolean;
  section_start?: number;
  section_end?: number;
  external_downloader?: string | boolean | Record<string, string | boolean>;
  external_downloader_args?: string[] | Record<string, string[]>;
}

export function attachDownloaderOptions(
  info: VideoInfo,
  options: YoutubeDLOptions,
): VideoInfo {
  const dl: YtdlpDownloaderOptions = {
    ratelimit: options.ratelimit,
    http_chunk_size: options.http_chunk_size,
    continuedl: options.continuedl,
    concurrent_fragment_downloads: options.concurrent_fragment_downloads,
    fragment_retries: options.fragment_retries,
    sleep_interval: options.sleep_interval,
    max_sleep_interval: options.max_sleep_interval,
    hls_use_mpegts: options.hls_use_mpegts as boolean | undefined,
    min_filesize: options.min_filesize as number | undefined,
    max_filesize: options.max_filesize as number | undefined,
    overwrites: options.overwrites,
    force_keyframes_at_cuts:
      options.force_keyframes_at_cuts || !!info.force_keyframes_at_cuts,
    section_start: info.section_start,
    section_end: info.section_end,
    external_downloader: options.external_downloader as
      | string
      | boolean
      | Record<string, string | boolean>
      | undefined,
    external_downloader_args: options.external_downloader_args,
  };
  info.__downloader_options = dl as Record<string, unknown>;
  return info;
}

export function readDownloaderOptions(
  meta: Record<string, unknown> | undefined,
): YtdlpDownloaderOptions {
  const raw = meta?.__downloader_options || meta?.downloaderOptions;
  if (raw && typeof raw === 'object') return raw as YtdlpDownloaderOptions;
  return {
    continuedl: meta?.continuedl as boolean | undefined,
    concurrent_fragment_downloads: meta?.concurrent_fragment_downloads as number | undefined,
    fragment_retries: meta?.fragment_retries as number | undefined,
    ratelimit: meta?.ratelimit as number | undefined,
    http_chunk_size: meta?.http_chunk_size as number | undefined,
    force_keyframes_at_cuts: meta?.force_keyframes_at_cuts as boolean | undefined,
    section_start: meta?.section_start as number | undefined,
    section_end: meta?.section_end as number | undefined,
  };
}
