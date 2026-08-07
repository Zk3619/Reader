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
import { getDownloadConfig } from '@/lib/download/gopeed/config';

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

function asFormatList(meta: DownloadTaskMeta): Format[] {
  return Array.isArray(meta.formats) ? (meta.formats as Format[]) : [];
}

function asRequestedParts(meta: DownloadTaskMeta): RequestedMediaPart[] {
  const raw = meta.requestedFormats;
  if (!Array.isArray(raw)) return [];
  const out: RequestedMediaPart[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url) continue;
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
    picked = formats.find((f) => String(f.format_id) === formatId) ?? null;
  }
  if (!picked) {
    picked =
      formats.find((f) => !!f.url && f.vcodec !== 'none' && f.acodec !== 'none') ||
      selectBestFormat(formats, 'bv*+ba/b') ||
      selectBestFormat(formats, 'b/best') ||
      formats.find((f) => !!f.url) ||
      null;
  }

  if (picked?.requested_formats?.length) {
    return picked.requested_formats
      .filter((f) => !!f.url)
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

async function engineExtra(): Promise<Record<string, unknown>> {
  const cfg = await getDownloadConfig();
  return {
    skipVerifyCert: cfg.skipVerifyCert,
    proxyMode: cfg.proxyMode,
    proxyUrl: cfg.proxyUrl,
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
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_fetch_fragments', {
    urls,
    outputPath,
    headers: headers || null,
    concurrency: 4,
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
      decrypt_info?: { METHOD?: string; URI?: string; IV?: string };
    }>;
  },
): Promise<string> {
  const { downloadHlsMediaNative, mediaPlaylistNeedsNativeAes, isHlsMediaPlaylist } = await import(
    '@/lib/download/ytdlp/hls-native'
  );
  const { downloadFragmentsConcat } = await import('@/lib/download/ytdlp/fragment-downloader');
  const { aes128CbcDecrypt } = await import('@/lib/download/ytdlp/aes');

  // Prefer pre-parsed fragments from extractor when present
  if (opts?.fragments?.length) {
    const needsDecrypt = opts.fragments.some(
      (f) => (f.decrypt_info?.METHOD || '').toUpperCase() === 'AES-128',
    );
    if (!needsDecrypt && !opts.hlsAes) {
      return fetchFragmentsToFile(
        opts.fragments.map((f) => f.url),
        outputPath,
        headers,
      );
    }
    const keyCache = new Map<string, Uint8Array>();
    const bytes = await downloadFragmentsConcat(
      opts.fragments.map((f) => ({ url: f.url })),
      headers,
      {
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
                proxy: null,
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
    await invoke('write_binary_file', { path: outputPath, data: Array.from(bytes) });
    return outputPath;
  }

  const man = await invoke<{ data: number[]; status: number }>('download_binary', {
    url: manifestUrl,
    method: 'GET',
    headers: headers || {},
    body: null,
    timeoutMs: 30000,
    useOkhttpUserAgent: false,
    proxy: null,
  });
  if (man.status >= 400) throw new Error(`HLS manifest HTTP ${man.status}`);
  const text = new TextDecoder().decode(new Uint8Array(man.data));
  if (!isHlsMediaPlaylist(text) && !mediaPlaylistNeedsNativeAes(text) && !opts?.hlsAes) {
    throw new Error('Not a media playlist for native AES path');
  }
  const bytes = await downloadHlsMediaNative(text, manifestUrl, {
    headers,
    hlsAes: opts?.hlsAes,
  });
  await invoke('write_binary_file', { path: outputPath, data: Array.from(bytes) });
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
        return {
          url,
          media_sequence: typeof frag.media_sequence === 'number' ? frag.media_sequence : undefined,
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

async function waitEngineTerminal(engineId: string): Promise<{
  status: string;
  filepath?: string;
  error?: string;
}> {
  const { listen } = await import('@tauri-apps/api/event');
  return new Promise((resolve, reject) => {
    let settled = false;
    void listen<{
      id?: string;
      status?: string;
      filepath?: string;
      error?: string;
    }>('download-engine-progress', (event) => {
      const p = event.payload;
      if (!p || p.id !== engineId || settled) return;
      const status = String(p.status || '').toLowerCase();
      if (status === 'done') {
        settled = true;
        resolve({ status, filepath: p.filepath, error: p.error });
      } else if (status === 'error') {
        settled = true;
        reject(new Error(p.error || '下载失败'));
      }
    });
  });
}

export async function startYtdlpEngineTask(task: DownloadTask): Promise<{
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

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const role = part.role || (i === 0 ? 'video' : 'audio');
    const tmp = withFileExt(
      `${basePath}.part-${role}-${i}`,
      part.ext || (role === 'audio' ? 'm4a' : 'mp4'),
    );

    if (isHlsProtocol(part.protocol, part.url) || part.protocol === 'm3u8_frag_urls') {
      const hlsAes = resolvePartHlsAes(task.meta, part);
      const hasFrags = hasMetaFragments(task.meta, part);
      if (part.protocol === 'm3u8_frag_urls' || hlsAes || hasFrags) {
        try {
          downloadedFiles.push(
            await fetchHlsNativeToFile(part.url, tmp, part.headers, {
              hlsAes,
              fragments: resolvePartFragmentDetails(task.meta, part),
            }),
          );
          continue;
        } catch (e) {
          // Fall back to ffmpeg when native AES path fails (e.g. live)
          console.warn('[engine-bridge] native HLS failed, fallback ffmpeg:', e);
        }
      }
      const liveHint =
        /\blive\b/i.test(part.url) || /\blive\b/i.test(part.protocol || '') || part.protocol === 'm3u8';
      downloadedFiles.push(
        await fetchHlsToFile(part.url, tmp, part.headers, {
          liveSeconds: liveHint ? 3600 : undefined,
          validateSegments: true,
        }),
      );
      continue;
    }

    if (isDashProtocol(part.protocol, part.url)) {
      downloadedFiles.push(
        await fetchDashToFile(part.url, tmp, part.headers, { validateSegments: true }),
      );
      continue;
    }

    const allowRtmp =
      cfg.ytdlp.allowRtmpFfmpeg === true || task.meta.allowRtmpFfmpeg === true;
    if (isRtmpFfmpegProtocol(part.protocol, part.url) && allowRtmp) {
      downloadedFiles.push(await fetchStreamToFile(part.url, tmp, part.headers));
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
        proxy: resolveYtdlpProxy(cfg.proxyMode === 'custom' ? cfg.proxyUrl : undefined),
      });
      if (extResult.ok) {
        downloadedFiles.push(extResult.outputPath || tmp);
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
    const terminal = await waitEngineTerminal(info.id);
    downloadedFiles.push(terminal.filepath || info.filepath || tmp);
  }

  let filepath = downloadedFiles[0] || withFileExt(basePath, mergeExt);
  let needsPostprocess = false;
  let postprocessReason: string | undefined;
  let pendingParts: string[] | undefined;

  if (downloadedFiles.length >= 2) {
    const out = withFileExt(basePath, mergeExt);
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

  // 可选：旁路下载一条字幕（writeSubs）——仅在已合并成片时尝试
  let subPath: string | undefined;
  if (!needsPostprocess && cfg.ytdlp.writeSubs) {
    const subs = task.meta.subtitles;
    if (subs && typeof subs === 'object') {
      const langPref = (cfg.ytdlp.subLangs || 'zh,en')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      for (const [lang, tracks] of Object.entries(subs as Record<string, unknown>)) {
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
        const candidate = `${filepath}.${lang}.${track.ext || 'vtt'}`;
        try {
          const subInfo = await createEngineDownload({
            url: track.url,
            filepath: candidate,
            name: `${task.title}-sub-${lang}`,
            headers: parts[0]?.headers,
          });
          await waitEngineTerminal(subInfo.id);
          subPath = candidate;
        } catch {
          /* 字幕失败不阻断成片 */
        }
        break;
      }
    }
  }

  // 嵌入字幕 / 元数据（系统 ffmpeg 仅作 remux 工具，提取能力在内置运行时）
  if (!needsPostprocess) {
    try {
      if (subPath && cfg.ytdlp.writeSubs) {
        const out = `${filepath}.embedded${filepath.includes('.') ? filepath.slice(filepath.lastIndexOf('.')) : '.mkv'}`;
        const r = await invoke<{ outputPath?: string }>('media_convert_embed_subs', {
          inputPath: filepath,
          subtitlePath: subPath,
          outputPath: out,
        });
        if (r?.outputPath) filepath = r.outputPath;
      }
      if (cfg.ytdlp.embedMetadata) {
        const r = await invoke<{ outputPath?: string }>('media_convert_embed_metadata', {
          inputPath: filepath,
          outputPath: filepath,
          metadata: {
            title: String(task.meta.title || task.title || ''),
            description: String(task.meta.description || ''),
            artist: String(task.meta.uploader || ''),
          },
        });
        if (r?.outputPath) filepath = r.outputPath;
      }
    } catch {
      /* 后处理失败不阻断成片 */
    }
  }

  return {
    info: {
      id: engineIds[0] || `ytdlp_${task.id}`,
      status: needsPostprocess ? 'needs_postprocess' : 'done',
      filepath,
      percent: 100,
    },
    filepath,
    formatId,
    engineIds,
    ...(needsPostprocess
      ? { needsPostprocess: true, pendingParts, postprocessReason }
      : {}),
  };
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
  await invoke('write_binary_file', { path: outputPath, data: Array.from(output) });
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
