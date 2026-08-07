/**
 * 前端队列 ↔ Tauri download_engine_* 桥接
 */

import { invoke } from '@tauri-apps/api/core';
import type { DownloadTask, DownloadTaskMeta } from '@/lib/download/task-model';
import type { Format } from '@/lib/download/ytdlp/types';
import { selectBestFormat } from '@/lib/download/ytdlp/format-selector';
import { unsupportedProtocolMessage, isRtmpFfmpegProtocol } from '@/lib/download/ytdlp/protocol-policy';
import {
  detectSpecialProtocol,
  downloadSpecialProtocol,
} from '@/lib/download/ytdlp/special-protocols';
import {
  parseExternalDownloader,
  runExternalDownload,
} from '@/lib/download/ytdlp/external-downloader';
import { resolveYtdlpProxy } from '@/lib/download/ytdlp/networking/socks';
import { resolveModuleOutboundProxy } from '@/lib/settings/outbound-proxy';
import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
import { getDownloadConfig } from '@/lib/download/gopeed/config';

/** 写入二进制：走 plugin-fs，避免 Array.from(Uint8Array) 把大文件展开成 number[] 卡死主线程 */
async function writeBinaryFileFast(path: string, data: Uint8Array | number[]): Promise<void> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const parent = path.replace(/[/\\][^/\\]+$/, '');
    if (parent && parent !== path) {
      try {
        await mkdir(parent, { recursive: true });
      } catch {
        /* exists */
      }
    }
    await writeFile(path, bytes);
    return;
  } catch {
    /* fall through */
  }
  if (bytes.byteLength > 4 * 1024 * 1024) {
    throw new Error('大文件写入需要 @tauri-apps/plugin-fs');
  }
  await invoke('write_binary_file', { path, data: Array.from(bytes) });
}

export interface EngineTaskInfo {
  id: string;
  protocol?: string;
  url?: string;
  name?: string;
  status?: string;
  downloaded?: number;
  total?: number;
  speed?: number;
  percent?: number;
  filepath?: string | null;
  error?: string | null;
}

export interface RequestedMediaPart {
  url: string;
  headers?: Record<string, string>;
  ext?: string;
  formatId?: string;
  role?: 'video' | 'audio' | 'merged' | string;
  protocol?: string;
}

export function engineTaskIdOf(task: DownloadTask): string | undefined {
  const id = task.meta?.engineTaskId;
  return typeof id === 'string' && id.trim() ? id : undefined;
}

export function engineTaskIdsOf(task: DownloadTask): string[] {
  const raw = task.meta?.engineTaskIds;
  if (!Array.isArray(raw)) {
    const one = engineTaskIdOf(task);
    return one ? [one] : [];
  }
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

/** 从 requestedFormats / formats 估算 ytdlp 任务总字节 */
export function estimateYtdlpTotalBytes(meta: DownloadTaskMeta): number {
  const raw = meta.requestedFormats;
  if (Array.isArray(raw) && raw.length > 0) {
    let sum = 0;
    let any = false;
    for (const item of raw) {
      const row = (item ?? {}) as Record<string, unknown>;
      const n = Number(row.filesize ?? row.filesize_approx ?? 0) || 0;
      if (n > 0) {
        sum += n;
        any = true;
      }
    }
    if (any) return sum;
  }

  const formats = asFormatList(meta);
  const formatId = typeof meta.formatId === 'string' ? meta.formatId.trim() : '';
  if (formatId && formats.length) {
    const ids = formatId.split('+').map((s) => s.trim()).filter(Boolean);
    let sum = 0;
    let any = false;
    for (const id of ids) {
      const f = formats.find((x) => String(x.format_id) === id);
      const n = Number(f?.filesize ?? f?.filesize_approx ?? 0) || 0;
      if (n > 0) {
        sum += n;
        any = true;
      }
    }
    if (any) return sum;
  }

  const fromMeta = Number((meta as { size?: unknown }).size ?? 0) || 0;
  if (fromMeta > 0) return fromMeta;

  return formats.reduce(
    (max, f) => Math.max(max, Number(f.filesize ?? f.filesize_approx ?? 0) || 0),
    0,
  );
}

function estimatePartBytes(meta: DownloadTaskMeta, part: RequestedMediaPart): number {
  const raw = meta.requestedFormats;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = (item ?? {}) as Record<string, unknown>;
      if (part.formatId && String(row.format_id || '') !== part.formatId) continue;
      const n = Number(row.filesize ?? row.filesize_approx ?? 0) || 0;
      if (n > 0) return n;
    }
  }
  if (part.formatId) {
    const f = asFormatList(meta).find((x) => String(x.format_id) === part.formatId);
    const n = Number(f?.filesize ?? f?.filesize_approx ?? 0) || 0;
    if (n > 0) return n;
  }
  return 0;
}

export type YtdlpProgressReport = {
  downloaded: number;
  total: number;
  speed?: number;
  percent?: number;
};

export type StartYtdlpEngineOptions = {
  /** 分轨/引擎进度（不含分轨终态，由调用方写 hub 任务） */
  onProgress?: (report: YtdlpProgressReport) => void;
  /** 当前活跃引擎任务 id（用于暂停映射） */
  onEngineBind?: (engineId: string, engineIds: string[]) => void;
};

function asFormatList(meta: DownloadTaskMeta): Format[] {
  return Array.isArray(meta.formats) ? (meta.formats as Format[]) : [];
}

function asRequestedParts(meta: DownloadTaskMeta): RequestedMediaPart[] {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return [];
  const out: RequestedMediaPart[] = [];
  const seenUrls = new Set<string>();
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const formatId = row.format_id ? String(row.format_id) : undefined;
    const vcodec = row.vcodec != null ? String(row.vcodec) : '';
    const acodec = row.acodec != null ? String(row.acodec) : '';
    let role = row.role ? String(row.role) : undefined;
    if (!role) {
      if (formatId?.includes('audio') || vcodec === 'none') role = 'audio';
      else if (formatId?.includes('video') || acodec === 'none') role = 'video';
    }
    out.push({
      url,
      headers:
        row.http_headers && typeof row.http_headers === 'object'
          ? (row.http_headers as Record<string, string>)
          : undefined,
      ext: row.ext ? String(row.ext) : undefined,
      formatId,
      role,
      protocol: row.protocol ? String(row.protocol) : undefined,
    });
  }
  return out;
}

/** 解析 ytdlp 任务要下载的媒体轨（可多轨） */
export function resolveYtdlpMediaParts(meta: DownloadTaskMeta): RequestedMediaPart[] {
  const fromMeta = asRequestedParts(meta);
  if (fromMeta.length > 0) return fromMeta;

  const formats = asFormatList(meta);
  const formatId = typeof meta.formatId === 'string' ? meta.formatId.trim() : '';

  let picked: Format | null = null;
  if (formatId) {
    // 支持 h264-1200k+hls-0 这类合成 id：先整串匹配，再按 + 拆开取第一段
    picked =
      formats.find((f) => String(f.format_id) === formatId) ??
      (() => {
        const first = formatId.split('+').map((s) => s.trim()).filter(Boolean)[0];
        return first ? formats.find((f) => String(f.format_id) === first) ?? null : null;
      })();
  }
  if (!picked) {
    // 必须先走 format selector（尊重 preference / 码率），禁止「数组第一个双轨」——
    // TED 等站点排序后 formats[0] 常是高分辨率 HLS，会盖过更稳的渐进式 MP4
    picked =
      selectBestFormat(formats, 'bv*+ba/b') ||
      selectBestFormat(formats, 'b/best') ||
      formats.find((f) => !!f.url && f.vcodec !== 'none' && f.acodec !== 'none') ||
      formats.find((f) => !!f.url) ||
      null;
  }

  if (picked?.requested_formats?.length) {
    const seen = new Set<string>();
    return picked.requested_formats
      .filter((f) => !!f.url)
      .filter((f) => {
        const u = String(f.url);
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      })
      .map((f) => ({
        url: String(f.url),
        headers: f.http_headers,
        ext: f.ext,
        formatId: f.format_id,
        role: f.vcodec === 'none' ? 'audio' : f.acodec === 'none' ? 'video' : 'merged',
        protocol: f.protocol ? String(f.protocol) : undefined,
      }));
  }

  if (picked?.url) {
    return [
      {
        url: picked.url,
        headers: picked.http_headers,
        ext: picked.ext,
        formatId: picked.format_id,
        role: 'merged',
        protocol: picked.protocol ? String(picked.protocol) : undefined,
      },
    ];
  }

  throw new Error('未解析到可下载的直链，请重新解析并选择带 URL 的格式');
}

/** @deprecated 使用 resolveYtdlpMediaParts */
export function resolveYtdlpDirectMedia(meta: DownloadTaskMeta): {
  url: string;
  headers?: Record<string, string>;
  ext?: string;
  formatId?: string;
} {
  const parts = resolveYtdlpMediaParts(meta);
  const first = parts[0]!;
  return {
    url: first.url,
    headers: first.headers,
    ext: first.ext,
    formatId: first.formatId,
  };
}

function withFileExt(filepath: string, ext?: string): string {
  if (!ext || !filepath) return filepath;
  const clean = ext.replace(/^\./, '');
  if (!clean) return filepath;
  if (/\.[a-z0-9]{1,8}$/i.test(filepath)) return filepath;
  return `${filepath}.${clean}`;
}

async function uniqueOutputPath(filepath: string): Promise<string> {
  const { ensureUniqueFilepath } = await import('./unique-path');
  return ensureUniqueFilepath(filepath);
}

async function engineExtra(): Promise<Record<string, unknown>> {
  const cfg = await getDownloadConfig();
  const outbound = resolveModuleOutboundProxy({
    mode: cfg.proxyMode,
    url: cfg.proxyUrl,
  });
  return {
    skipVerifyCert: cfg.skipVerifyCert,
    proxyMode: outbound.proxyMode,
    proxyUrl: outbound.proxy ?? cfg.proxyUrl,
    userAgent: cfg.protocolConfig.http.userAgent,
    bt: {
      listenPort: cfg.protocolConfig.bt.listenPort,
      trackers: cfg.protocolConfig.bt.trackers,
      seedKeep: cfg.protocolConfig.bt.seedKeep,
      seedRatio: cfg.protocolConfig.bt.seedRatio,
      seedTimeMinutes: cfg.protocolConfig.bt.seedTimeMinutes,
    },
  };
}

async function resolveDownloadOutboundProxyUrl(): Promise<string | undefined> {
  const cfg = await getDownloadConfig();
  const outbound = resolveModuleOutboundProxy({
    mode: cfg.proxyMode,
    url: cfg.proxyUrl,
  });
  if (outbound.proxyMode === 'custom' && outbound.proxy) {
    return resolveYtdlpProxy(outbound.proxy);
  }
  // windows/env/none：由 download_binary / 引擎按 mode 处理；外部下载器仅支持 URL
  return outbound.proxy ? resolveYtdlpProxy(outbound.proxy) : undefined;
}

export async function createEngineDownload(opts: {
  url: string;
  filepath?: string;
  name?: string;
  headers?: Record<string, string>;
  connections?: number;
  selectedFiles?: number[];
  extra?: Record<string, unknown>;
}): Promise<EngineTaskInfo> {
  const cfg = await getDownloadConfig();
  const connections = opts.connections ?? cfg.protocolConfig?.http?.connections ?? 16;
  const headers = { ...(opts.headers ?? {}) };
  if (
    cfg.protocolConfig.http.userAgent &&
    !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')
  ) {
    headers['User-Agent'] = cfg.protocolConfig.http.userAgent;
  }
  const extra: Record<string, unknown> = {
    ...(await engineExtra()),
    ...(opts.extra ?? {}),
  };
  if (/^ed2k:\/\//i.test(opts.url) && cfg.protocolConfig.ed2k.serverList.length) {
    extra.servers = cfg.protocolConfig.ed2k.serverList;
    extra.serverList = cfg.protocolConfig.ed2k.serverList;
  }
  const info = await invoke<EngineTaskInfo>('download_engine_create', {
    req: {
      url: opts.url,
      path: opts.filepath || undefined,
      name: opts.name || undefined,
      connections,
      headers,
      selectedFiles: opts.selectedFiles,
      extra,
    },
  });
  return info;
}

export async function startGopeedEngineTask(task: DownloadTask): Promise<EngineTaskInfo> {
  const selected =
    Array.isArray(task.meta.selectFiles) && task.meta.selectFiles.length
      ? task.meta.selectFiles
      : undefined;
  return createEngineDownload({
    url: task.url,
    filepath: task.filepath || undefined,
    name: task.title,
    selectedFiles: selected,
  });
}

export async function mergeLocalMediaFiles(
  inputs: string[],
  outputPath: string,
  container?: string,
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_merge_files', {
    inputs,
    outputPath,
    container: container || undefined,
  });
  return String(r?.outputPath || outputPath);
}

export async function fetchHlsToFile(
  url: string,
  outputPath: string,
  headers?: Record<string, string>,
  opts?: { liveSeconds?: number; validateSegments?: boolean },
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_fetch_hls', {
    url,
    outputPath,
    headers,
    liveSeconds: opts?.liveSeconds ?? null,
    validateSegments: opts?.validateSegments ?? true,
  });
  return String(r?.outputPath || outputPath);
}

/** Generic ffmpeg -i URL -c copy（RTMP / 任意 ffmpeg 可读流） */
export async function fetchStreamToFile(
  url: string,
  outputPath: string,
  headers?: Record<string, string>,
): Promise<string> {
  try {
    const r = await invoke<{ outputPath?: string }>('media_convert_fetch_url', {
      url,
      outputPath,
      headers,
    });
    return String(r?.outputPath || outputPath);
  } catch {
    // Fallback: HLS command without segment validation works for rtmp:// too
    return fetchHlsToFile(url, outputPath, headers, { validateSegments: false });
  }
}

export async function fetchDashToFile(
  url: string,
  outputPath: string,
  headers?: Record<string, string>,
  opts?: { validateSegments?: boolean },
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_fetch_dash', {
    url,
    outputPath,
    headers,
    validateSegments: opts?.validateSegments ?? true,
  });
  return String(r?.outputPath || outputPath);
}

export async function fetchFragmentsToFile(
  urls: string[],
  outputPath: string,
  headers?: Record<string, string>,
  opts?: { concurrency?: number; continuedl?: boolean },
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_fetch_fragments', {
    urls,
    outputPath,
    headers: headers || null,
    concurrency: opts?.concurrency ?? 4,
    continuedl: opts?.continuedl ?? true,
    byteRanges: null,
  });
  return String(r?.outputPath || outputPath);
}

/** Native HLS (AES-128 decrypt in TS) → write_binary_file */
export async function fetchHlsNativeToFile(
  manifestUrl: string,
  outputPath: string,
  headers?: Record<string, string>,
  opts?: {
    hlsAes?: { key?: string; iv?: string; uri?: string };
    fragments?: Array<{
      url: string;
      media_sequence?: number;
      byte_range?: { start: number; end: number };
      decrypt_info?: { METHOD?: string; URI?: string; IV?: string };
    }>;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<string> {
  const {
    downloadHlsMediaNative,
    mediaPlaylistNeedsNativeAes,
    isHlsMediaPlaylist,
    parseHlsMediaPlaylist,
    collapseContiguousSameUrlByteRanges,
  } = await import('@/lib/download/ytdlp/hls-native');
  const { downloadFragmentsConcat, writeFragmentsToFile } = await import(
    '@/lib/download/ytdlp/fragment-downloader'
  );
  const { aes128CbcDecrypt } = await import('@/lib/download/ytdlp/aes');

  // Prefer pre-parsed fragments from extractor when present
  if (opts?.fragments?.length) {
    const needsDecrypt = opts.fragments.some(
      (f) => (f.decrypt_info?.METHOD || '').toUpperCase() === 'AES-128',
    );
    const hasByteRanges = opts.fragments.some(
      (f) => f.byte_range && f.byte_range.end > f.byte_range.start,
    );
    if (!needsDecrypt && !opts.hlsAes && !hasByteRanges) {
      return fetchFragmentsToFile(
        opts.fragments.map((f) => f.url),
        outputPath,
        headers,
      );
    }
    if (!needsDecrypt && !opts.hlsAes) {
      return writeFragmentsToFile(
        opts.fragments.map((f) => ({
          url: f.url,
          byteRange: f.byte_range,
        })),
        outputPath,
        headers,
        { onProgress: opts.onProgress },
      );
    }
    const keyCache = new Map<string, Uint8Array>();
    const bytes = await downloadFragmentsConcat(
      opts.fragments.map((f) => ({
        url: f.url,
        byteRange: f.byte_range,
      })),
      headers,
      {
        onProgress: opts.onProgress,
        decrypt: async (chunk, index) => {
          const frag = opts.fragments![index]!;
          const method = (frag.decrypt_info?.METHOD || (opts.hlsAes ? 'AES-128' : 'NONE')).toUpperCase();
          if (method !== 'AES-128') return chunk;
          let key: Uint8Array | undefined;
          if (opts.hlsAes?.key) {
            const hex = opts.hlsAes.key.replace(/^0x/i, '');
            key = Uint8Array.from(hex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
          } else if (frag.decrypt_info?.URI) {
            let cached = keyCache.get(frag.decrypt_info.URI);
            if (!cached) {
              const r = await invoke<{ data: number[]; status: number }>('download_binary', {
                url: frag.decrypt_info.URI,
                method: 'GET',
                headers: headers || {},
                body: null,
                timeoutMs: 30000,
                useOkhttpUserAgent: false,
                ...downloadBinaryProxyArgs(),
              });
              if (r.status >= 400) throw new Error(`HLS key HTTP ${r.status}`);
              cached = new Uint8Array(r.data);
              keyCache.set(frag.decrypt_info.URI, cached);
            }
            key = cached;
          }
          if (!key) throw new Error('Missing HLS AES key');
          let iv: Uint8Array;
          if (opts.hlsAes?.iv) {
            const hex = opts.hlsAes.iv.replace(/^0x/i, '').padStart(32, '0');
            iv = Uint8Array.from(hex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
          } else if (frag.decrypt_info?.IV) {
            const hex = frag.decrypt_info.IV.replace(/^0x/i, '').padStart(32, '0');
            iv = Uint8Array.from(hex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
          } else {
            iv = new Uint8Array(16);
            new DataView(iv.buffer).setUint32(12, (frag.media_sequence ?? index) >>> 0, false);
          }
          return aes128CbcDecrypt(chunk, key, iv);
        },
      },
    );
    await writeBinaryFileFast(outputPath, bytes);
    return outputPath;
  }

  const man = await invoke<{ data: number[]; status: number }>('download_binary', {
    url: manifestUrl,
    method: 'GET',
    headers: headers || {},
    body: null,
    timeoutMs: 30000,
    useOkhttpUserAgent: false,
    ...downloadBinaryProxyArgs(),
  });
  if (man.status >= 400) throw new Error(`HLS manifest HTTP ${man.status}`);
  const text = new TextDecoder().decode(new Uint8Array(man.data));
  if (!isHlsMediaPlaylist(text) && !mediaPlaylistNeedsNativeAes(text) && !opts?.hlsAes) {
    throw new Error('Not a media playlist for native AES path');
  }

  const parsed = parseHlsMediaPlaylist(text, manifestUrl);
  if (parsed.hasDrm) throw new Error('HLS stream is DRM protected');
  if (parsed.unsupportedAes) throw new Error('HLS encryption METHOD not supported (need AES-128)');
  if (!parsed.fragments.length) throw new Error('HLS media playlist has no segments');

  const needsAes =
    !!opts?.hlsAes ||
    mediaPlaylistNeedsNativeAes(text) ||
    parsed.fragments.some((f) => f.decrypt.method === 'AES-128');

  // Plain CMAF / byterange VOD: prefer disk fragment fetch (Range) or single-asset HTTP engine
  if (!needsAes) {
    const collapsed = collapseContiguousSameUrlByteRanges(parsed.fragments);
    // Same-URI contiguous ranges starting at 0 → download the CMAF asset once with progress
    if (collapsed && collapsed.byteRange.start === 0) {
      try {
        const info = await createEngineDownload({
          url: collapsed.url,
          filepath: outputPath,
          headers,
        });
        const terminal = await waitEngineTerminal(info.id, {
          onProgress: (p) => {
            const done = p.downloaded || 0;
            const total = p.total && p.total > 0 ? p.total : collapsed.byteRange.end;
            opts?.onProgress?.(done, total);
          },
        });
        return terminal.filepath || info.filepath || outputPath;
      } catch (e) {
        console.warn('[engine-bridge] CMAF asset download failed, fallback Range fragments:', e);
      }
    }
    return writeFragmentsToFile(
      parsed.fragments.map((f) => ({
        url: f.url,
        duration: f.duration,
        byteRange: f.byteRange,
      })),
      outputPath,
      headers,
      { onProgress: opts?.onProgress },
    );
  }

  const bytes = await downloadHlsMediaNative(text, manifestUrl, {
    headers,
    hlsAes: opts?.hlsAes,
    onProgress: opts?.onProgress,
  });
  await writeBinaryFileFast(outputPath, bytes);
  return outputPath;
}

function isHlsProtocol(protocol?: string, url?: string): boolean {
  const p = (protocol || '').toLowerCase();
  if (p.includes('m3u8')) return true;
  return /\.m3u8(\?|$)/i.test(url || '');
}

function isDashProtocol(protocol?: string, url?: string): boolean {
  const p = (protocol || '').toLowerCase();
  if (p.includes('dash') && !p.includes('segment')) return true;
  return /\.mpd(\?|$)/i.test(url || '');
}

function isFragmentProtocol(protocol?: string): boolean {
  const p = (protocol || '').toLowerCase();
  return (
    p === 'ism' ||
    p === 'f4m' ||
    p === 'f4m_fragments' ||
    p.includes('http_dash_segments') ||
    p.includes('fragment')
  );
}

function hasMetaFragments(meta: DownloadTaskMeta, part: RequestedMediaPart): boolean {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return false;
  return raw.some((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    if (part.formatId && String(row.format_id || '') !== part.formatId) return false;
    return Array.isArray(row.fragments) && (row.fragments as unknown[]).length > 0;
  });
}

function resolvePartFragments(meta: DownloadTaskMeta, part: RequestedMediaPart): string[] {
  return resolvePartFragmentDetails(meta, part).map((f) => f.url);
}

function resolvePartFragmentDetails(
  meta: DownloadTaskMeta,
  part: RequestedMediaPart,
): Array<{
  url: string;
  media_sequence?: number;
  byte_range?: { start: number; end: number };
  decrypt_info?: { METHOD?: string; URI?: string; IV?: string };
}> {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    if (part.formatId && String(row.format_id || '') !== part.formatId) continue;
    const frags = row.fragments;
    if (!Array.isArray(frags)) continue;
    return frags
      .map((f) => {
        const frag = (f ?? {}) as Record<string, unknown>;
        const url = String(frag.url || '').trim();
        const br = frag.byte_range;
        let byte_range: { start: number; end: number } | undefined;
        if (br && typeof br === 'object') {
          const start = Number((br as { start?: unknown }).start);
          const end = Number((br as { end?: unknown }).end);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            byte_range = { start, end };
          }
        }
        return {
          url,
          media_sequence: typeof frag.media_sequence === 'number' ? frag.media_sequence : undefined,
          byte_range,
          decrypt_info:
            frag.decrypt_info && typeof frag.decrypt_info === 'object'
              ? (frag.decrypt_info as { METHOD?: string; URI?: string; IV?: string })
              : undefined,
        };
      })
      .filter((f) => /^https?:\/\//i.test(f.url));
  }
  return [];
}

function resolvePartHlsAes(
  meta: DownloadTaskMeta,
  part: RequestedMediaPart,
): { key?: string; iv?: string; uri?: string } | undefined {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return undefined;
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    if (part.formatId && String(row.format_id || '') !== part.formatId) continue;
    const aes = row.hls_aes;
    if (aes && typeof aes === 'object') return aes as { key?: string; iv?: string; uri?: string };
  }
  return undefined;
}

async function getEngineTaskInfo(engineId: string): Promise<EngineTaskInfo | undefined> {
  try {
    const list = await invoke<EngineTaskInfo[]>('download_engine_list');
    return list.find((t) => t.id === engineId);
  } catch {
    return undefined;
  }
}

function engineStatusOf(info: { status?: string } | null | undefined): string {
  return String(info?.status || '').toLowerCase();
}

async function waitEngineTerminal(
  engineId: string,
  opts?: {
    onProgress?: (payload: {
      downloaded?: number;
      total?: number;
      speed?: number;
      percent?: number;
      status?: string;
    }) => void;
    /** 可选：超时（毫秒）；到时仍未终态则 reject */
    timeoutMs?: number;
  },
): Promise<{
  status: string;
  filepath?: string;
  error?: string;
  downloaded?: number;
  total?: number;
}> {
  const { listen } = await import('@tauri-apps/api/event');

  const toResult = (info: EngineTaskInfo, status = engineStatusOf(info)) => ({
    status,
    filepath: info.filepath || undefined,
    error: info.error || undefined,
    downloaded: typeof info.downloaded === 'number' ? info.downloaded : undefined,
    total: typeof info.total === 'number' ? info.total : undefined,
  });

  // 创建后极短窗口内可能已结束：先查一次，避免 listen 注册前漏掉 done
  const early = await getEngineTaskInfo(engineId);
  if (early) {
    const st = engineStatusOf(early);
    if (st === 'done') return toResult(early, st);
    if (st === 'error') throw new Error(early.error || '下载失败');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let unlisten: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let lastDownloaded = early?.downloaded ?? 0;
    let lastTotal = early?.total ?? 0;
    let completeSince: number | null = null;

    const cleanup = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (timeoutTimer != null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
      unlisten = null;
    };

    const succeed = (payload: {
      status: string;
      filepath?: string;
      error?: string;
      downloaded?: number;
      total?: number;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const considerInfo = (info: EngineTaskInfo) => {
      if (typeof info.downloaded === 'number') lastDownloaded = info.downloaded;
      if (typeof info.total === 'number' && info.total > 0) lastTotal = info.total;
      opts?.onProgress?.({
        downloaded: info.downloaded,
        total: info.total,
        speed: info.speed,
        percent: info.percent,
        status: info.status,
      });

      const st = engineStatusOf(info);
      if (st === 'done') {
        succeed(toResult(info, st));
        return;
      }
      if (st === 'error') {
        fail(new Error(info.error || '下载失败'));
        return;
      }

      // 字节已齐且终稿路径已非 .part，但 status 偶发未翻转时，短暂确认后视为完成
      const fp = String(info.filepath || '');
      const bytesDone =
        lastTotal > 0 && lastDownloaded >= lastTotal && !fp.toLowerCase().endsWith('.part');
      if (bytesDone && (st === 'running' || st === 'waiting')) {
        if (completeSince == null) completeSince = Date.now();
        else if (Date.now() - completeSince >= 1200) {
          succeed({
            status: 'done',
            filepath: fp || undefined,
            downloaded: lastDownloaded,
            total: lastTotal,
          });
        }
      } else {
        completeSince = null;
      }
    };

    void listen<{
      id?: string;
      status?: string;
      filepath?: string;
      error?: string;
      downloaded?: number;
      total?: number;
      speed?: number;
      percent?: number;
    }>('download-engine-progress', (event) => {
      const p = event.payload;
      if (!p || p.id !== engineId || settled) return;
      if (typeof p.downloaded === 'number') lastDownloaded = p.downloaded;
      if (typeof p.total === 'number' && p.total > 0) lastTotal = p.total;
      const status = String(p.status || '').toLowerCase();
      if (status === 'done') {
        succeed({
          status,
          filepath: p.filepath,
          error: p.error,
          downloaded: lastDownloaded,
          total: lastTotal,
        });
        return;
      }
      if (status === 'error') {
        fail(new Error(p.error || '下载失败'));
        return;
      }
      opts?.onProgress?.({
        downloaded: p.downloaded,
        total: p.total,
        speed: p.speed,
        percent: p.percent,
        status: p.status,
      });
    }).then((fn) => {
      if (settled) {
        try {
          fn();
        } catch {
          /* ignore */
        }
        return;
      }
      unlisten = fn;
    });

    pollTimer = setInterval(() => {
      void getEngineTaskInfo(engineId).then((info) => {
        if (!info || settled) return;
        considerInfo(info);
      });
    }, 400);

    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        fail(new Error(`等待引擎任务结束超时（${Math.round(opts.timeoutMs! / 1000)}s）`));
      }, opts.timeoutMs);
    }
  });
}

export async function startYtdlpEngineTask(
  task: DownloadTask,
  opts?: StartYtdlpEngineOptions,
): Promise<{
  info: EngineTaskInfo;
  filepath: string;
  formatId?: string;
  engineIds: string[];
  /** 分轨已齐，但合并/后处理依赖外部工具未完成 */
  needsPostprocess?: boolean;
  pendingParts?: string[];
  postprocessReason?: string;
}> {
  const cfg = await getDownloadConfig();
  const parts = resolveYtdlpMediaParts(task.meta);
  const basePath = task.filepath || task.title || 'download';
  const mergeExt =
    cfg.ytdlp.mergeOutputFormat === 'default' ? 'mp4' : cfg.ytdlp.mergeOutputFormat;
  const formatId = parts.map((p) => p.formatId).filter(Boolean).join('+') || undefined;

  const downloadedFiles: string[] = [];
  const engineIds: string[] = [];
  const estimatedTotal = estimateYtdlpTotalBytes(task.meta);
  const partEstimates = parts.map((p) => estimatePartBytes(task.meta, p));
  let completedBytes = 0;

  const reportProgress = (partDownloaded: number, partTotal: number, speed?: number) => {
    const downloaded = completedBytes + Math.max(0, partDownloaded);
    let total = estimatedTotal;
    if (!(total > 0)) {
      const restEstimate = partEstimates
        .slice(downloadedFiles.length + 1)
        .reduce((a, b) => a + b, 0);
      const cur = partTotal > 0 ? partTotal : partEstimates[downloadedFiles.length] || 0;
      total = completedBytes + cur + restEstimate;
    }
    if (!(total > 0) && partTotal > 0) total = completedBytes + partTotal;
    const percent =
      total > 0
        ? Math.min(100, (downloaded / total) * 100)
        : parts.length > 0
          ? Math.min(
              99,
              ((downloadedFiles.length + (partTotal > 0 ? partDownloaded / partTotal : 0)) /
                parts.length) *
                100,
            )
          : 0;
    opts?.onProgress?.({
      downloaded,
      total: total > 0 ? total : 0,
      speed,
      percent,
    });
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const role = part.role || (i === 0 ? 'video' : 'audio');
    const partExt =
      part.ext || (role === 'audio' ? 'm4a' : parts.length === 1 ? mergeExt : 'mp4');
    // 单文件直接落到最终名；多轨才用 .part-* 临时名，合并后再写成片
    const outputStem =
      parts.length === 1 ? basePath : `${basePath}.part-${role}-${i}`;
    const tmp = await uniqueOutputPath(withFileExt(outputStem, partExt));

    if (isHlsProtocol(part.protocol, part.url) || part.protocol === 'm3u8_frag_urls') {
      const hlsAes = resolvePartHlsAes(task.meta, part);
      const hasFrags = hasMetaFragments(task.meta, part);
      const liveHint =
        /\blive\b/i.test(part.url) ||
        /\blive\b/i.test(part.protocol || '') ||
        // plain `m3u8` (not m3u8_native) historically meant ffmpeg live pull
        part.protocol === 'm3u8';
      // VOD: prefer in-process fragment concat (no system ffmpeg). Live keeps ffmpeg path.
      const preferNative =
        !liveHint ||
        part.protocol === 'm3u8_frag_urls' ||
        part.protocol === 'm3u8_native' ||
        !!hlsAes ||
        hasFrags;
      if (preferNative) {
        try {
          downloadedFiles.push(
            await fetchHlsNativeToFile(part.url, tmp, part.headers, {
              hlsAes,
              fragments: resolvePartFragmentDetails(task.meta, part),
              onProgress: (done, total) => {
                const est = partEstimates[i] || 0;
                reportProgress(
                  est > 0 && total > 0 ? Math.round((done / total) * est) : done,
                  est > 0 ? est : total,
                );
              },
            }),
          );
          completedBytes += partEstimates[i] || 0;
          reportProgress(0, 0, 0);
          continue;
        } catch (e) {
          // Fall back to ffmpeg when native path fails (e.g. master playlist / live)
          console.warn('[engine-bridge] native HLS failed, fallback ffmpeg:', e);
        }
      }
      downloadedFiles.push(
        await fetchHlsToFile(part.url, tmp, part.headers, {
          liveSeconds: liveHint ? 3600 : undefined,
          validateSegments: true,
        }),
      );
      completedBytes += partEstimates[i] || 0;
      reportProgress(0, 0, 0);
      continue;
    }

    if (isDashProtocol(part.protocol, part.url)) {
      downloadedFiles.push(
        await fetchDashToFile(part.url, tmp, part.headers, { validateSegments: true }),
      );
      completedBytes += partEstimates[i] || 0;
      reportProgress(0, 0, 0);
      continue;
    }

    const allowRtmp =
      cfg.ytdlp.allowRtmpFfmpeg === true || task.meta.allowRtmpFfmpeg === true;
    if (isRtmpFfmpegProtocol(part.protocol, part.url) && allowRtmp) {
      downloadedFiles.push(await fetchStreamToFile(part.url, tmp, part.headers));
      completedBytes += partEstimates[i] || 0;
      reportProgress(0, 0, 0);
      continue;
    }

    const special = detectSpecialProtocol(part.protocol, part.url);
    if (special) {
      downloadedFiles.push(
        await downloadSpecialProtocol({
          protocol: special,
          url: part.url,
          outputPath: tmp,
          headers: part.headers,
        }),
      );
      completedBytes += partEstimates[i] || 0;
      reportProgress(0, 0, 0);
      continue;
    }

    const extKind = parseExternalDownloader(
      (task.meta.external_downloader as string | boolean | undefined) ||
        (cfg.ytdlp as { externalDownloader?: string }).externalDownloader,
    );
    if (extKind && extKind !== 'ffmpeg') {
      const extResult = await runExternalDownload({
        kind: extKind,
        url: part.url,
        outputPath: tmp,
        headers: part.headers,
        proxy: await resolveDownloadOutboundProxyUrl(),
      });
      if (extResult.ok) {
        downloadedFiles.push(extResult.outputPath || tmp);
        completedBytes += partEstimates[i] || 0;
        reportProgress(0, 0, 0);
        continue;
      }
      console.warn('[engine-bridge] external downloader failed, fallback Gopeed:', extResult.warning);
    }

    if (isFragmentProtocol(part.protocol) || hasMetaFragments(task.meta, part)) {
      const frags = resolvePartFragments(task.meta, part);
      if (frags.length > 0) {
        if (resolvePartFragmentTransform(task.meta, part) === 'f4m_mdat') {
          downloadedFiles.push(await fetchF4mFragmentsToFile(frags, tmp, part.headers));
        } else {
          downloadedFiles.push(await fetchFragmentsToFile(frags, tmp, part.headers));
        }
        completedBytes += partEstimates[i] || 0;
        reportProgress(0, 0, 0);
        continue;
      }
    }

    const unsupported = unsupportedProtocolMessage(part.protocol, part.url, {
      allowRtmpFfmpeg: allowRtmp,
    });
    if (unsupported) {
      throw new Error(unsupported);
    }

    const info = await createEngineDownload({
      url: part.url,
      filepath: tmp,
      name: `${task.title}-${role}`,
      headers: part.headers,
    });
    engineIds.push(info.id);
    opts?.onEngineBind?.(info.id, [...engineIds]);
    const terminal = await waitEngineTerminal(info.id, {
      onProgress: (p) => {
        reportProgress(p.downloaded || 0, p.total || 0, p.speed);
      },
    });
    const partDone =
      (typeof terminal.downloaded === 'number' && terminal.downloaded > 0
        ? terminal.downloaded
        : 0) ||
      (typeof terminal.total === 'number' && terminal.total > 0 ? terminal.total : 0) ||
      partEstimates[i] ||
      0;
    completedBytes += partDone;
    reportProgress(0, 0, 0);
    downloadedFiles.push(terminal.filepath || info.filepath || tmp);
  }

  let filepath = downloadedFiles[0] || (await uniqueOutputPath(withFileExt(basePath, mergeExt)));
  let needsPostprocess = false;
  let postprocessReason: string | undefined;
  let pendingParts: string[] | undefined;

  if (downloadedFiles.length >= 2) {
    const out = await uniqueOutputPath(withFileExt(basePath, mergeExt));
    try {
      filepath = await mergeLocalMediaFiles(downloadedFiles, out, mergeExt);
      for (const f of downloadedFiles) {
        if (f === filepath) continue;
        try {
          const { remove } = await import('@tauri-apps/plugin-fs');
          await remove(f);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      // 分轨已落盘：标为待合并，保留分轨，不按失败/丢文件处理
      needsPostprocess = true;
      pendingParts = [...downloadedFiles];
      filepath = out;
      postprocessReason =
        e instanceof Error
          ? e.message
          : String(e || '音视频分轨已下载，需外部工具（如 ffmpeg）合并');
      if (!isExternalToolUnavailableError(postprocessReason)) {
        postprocessReason = `音视频分轨已下载，合并未完成：${postprocessReason}`;
      }
    }
  }

  // 媒体已齐：立即按成片完成返回；字幕/嵌入改为后台，避免卡住「下载中」
  const finalTotal = estimatedTotal > 0 ? estimatedTotal : completedBytes;
  opts?.onProgress?.({
    downloaded: finalTotal > 0 ? finalTotal : completedBytes,
    total: finalTotal,
    speed: 0,
    percent: 100,
  });

  const result = {
    info: {
      id: engineIds[0] || `ytdlp_${task.id}`,
      status: needsPostprocess ? 'needs_postprocess' : 'done',
      filepath,
      percent: 100,
      downloaded: finalTotal > 0 ? finalTotal : completedBytes,
      total: finalTotal,
      speed: 0,
    },
    filepath,
    formatId,
    engineIds,
    ...(needsPostprocess
      ? { needsPostprocess: true as const, pendingParts, postprocessReason }
      : {}),
  };

  if (
    !needsPostprocess &&
    (cfg.ytdlp.writeSubs ||
      cfg.ytdlp.embedMetadata ||
      task.meta.embedMetadata === true)
  ) {
    const mediaPath = filepath;
    const title = task.title;
    const meta = task.meta;
    const headers = parts[0]?.headers;
    void (async () => {
      let subPath: string | undefined;
      let outPath = mediaPath;
      try {
        if (cfg.ytdlp.writeSubs && meta.subtitles && typeof meta.subtitles === 'object') {
          const langPref = (cfg.ytdlp.subLangs || 'zh,en')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          for (const [lang, tracks] of Object.entries(meta.subtitles as Record<string, unknown>)) {
            if (
              langPref.length &&
              !langPref.some(
                (p) => p === 'all' || lang.toLowerCase().startsWith(p.replace('.*', '')),
              )
            ) {
              continue;
            }
            const list = Array.isArray(tracks) ? tracks : [];
            const track = list.find((t) => (t as { url?: string })?.url) as
              | { url?: string; ext?: string }
              | undefined;
            if (!track?.url) continue;
            const candidate = `${mediaPath}.${lang}.${track.ext || 'vtt'}`;
            try {
              const subInfo = await createEngineDownload({
                url: track.url,
                filepath: candidate,
                name: `${title}-sub-${lang}`,
                headers,
              });
              await waitEngineTerminal(subInfo.id, { timeoutMs: 60_000 });
              subPath = candidate;
            } catch {
              /* ignore */
            }
            break;
          }
        }
        if (subPath && cfg.ytdlp.writeSubs) {
          const embedded = `${mediaPath}.embedded${mediaPath.includes('.') ? mediaPath.slice(mediaPath.lastIndexOf('.')) : '.mkv'}`;
          const r = await invoke<{ outputPath?: string }>('media_convert_embed_subs', {
            inputPath: mediaPath,
            subtitlePath: subPath,
            outputPath: embedded,
          });
          if (r?.outputPath) outPath = r.outputPath;
        }
        if (cfg.ytdlp.embedMetadata || meta.embedMetadata === true) {
          const r = await invoke<{ outputPath?: string }>('media_convert_embed_metadata', {
            inputPath: outPath,
            outputPath: outPath,
            metadata: {
              title: String(meta.title || title || ''),
              description: String(meta.description || ''),
              artist: String(meta.uploader || ''),
            },
          });
          if (r?.outputPath) outPath = r.outputPath;
        }
      } catch {
        /* 后处理失败不影响已完成成片 */
      }
      void outPath;
    })();
  }

  return result;
}

/** 合并/拉流依赖系统 ffmpeg 等外部工具不可用 */
function isExternalToolUnavailableError(msg: string): boolean {
  return /ffmpeg|ffprobe|media-ffmpeg|无法启动|未启用 media-ffmpeg|合并失败|未生成输出/i.test(
    msg,
  );
}

export async function pauseEngineTask(engineId: string): Promise<void> {
  await invoke('download_engine_pause', { id: engineId });
}

export async function continueEngineTask(engineId: string): Promise<void> {
  await invoke('download_engine_continue', { id: engineId });
}

export async function deleteEngineTask(
  engineId: string,
  removeFiles = false,
): Promise<void> {
  await invoke('download_engine_delete', {
    id: engineId,
    removeFiles,
  });
}

/** 按路径删除下载产物（成片 / 分轨 / 旁路 .part），走 Rust std::fs，不依赖 fs scope */
export async function deleteLocalDownloadFiles(paths: string[]): Promise<number> {
  const cleaned = [
    ...new Set(paths.map((p) => String(p || '').trim()).filter(Boolean)),
  ];
  if (!cleaned.length) return 0;
  try {
    const n = await invoke<number>('download_engine_delete_paths', { paths: cleaned });
    return Number(n) || 0;
  } catch {
    /* fall through */
  }
  let removed = 0;
  try {
    const { remove, stat } = await import('@tauri-apps/plugin-fs');
    for (const p of cleaned) {
      for (const candidate of [p, `${p}.part`]) {
        try {
          const s = await stat(candidate);
          await remove(candidate, { recursive: Boolean(s.isDirectory) });
          removed += 1;
        } catch {
          try {
            await remove(candidate);
            removed += 1;
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

export function mapEngineStatus(status: string | undefined): DownloadTask['state'] | undefined {
  if (!status) return undefined;
  switch (status.toLowerCase()) {
    case 'waiting':
      return 'waiting';
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'error':
      return 'error';
    case 'done':
      return 'done';
    case 'needs_postprocess':
      return 'needs_postprocess';
    default:
      return undefined;
  }
}

async function fetchF4mFragmentsToFile(
  urls: string[],
  outputPath: string,
  headers?: Record<string, string>,
): Promise<string> {
  const { downloadFragmentsConcat } = await import('@/lib/download/ytdlp/fragment-downloader');
  const { extractF4mMdat, makeFlvHeader } = await import('@/lib/download/ytdlp/f4m-native');
  const payload = await downloadFragmentsConcat(
    urls.map((url) => ({ url })),
    headers,
    { decrypt: (chunk) => extractF4mMdat(chunk) },
  );
  const header = makeFlvHeader();
  const output = new Uint8Array(header.length + payload.length);
  output.set(header);
  output.set(payload, header.length);
  await writeBinaryFileFast(outputPath, output);
  return outputPath;
}

function resolvePartFragmentTransform(
  meta: DownloadTaskMeta,
  part: RequestedMediaPart,
): string | undefined {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return undefined;
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    if (part.formatId && String(row.format_id || '') !== part.formatId) continue;
    if (typeof row.fragment_transform === 'string') return row.fragment_transform;
  }
  return undefined;
}
