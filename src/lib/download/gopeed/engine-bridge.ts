/**
 * 前端队列 ↔ Tauri download_engine_* 桥接
 */

import { invoke } from '@tauri-apps/api/core';
import type { DownloadTask, DownloadTaskMeta } from '@/lib/download/task-model';
import type { Format } from '@/lib/download/ytdlp/types';
import { selectBestFormat } from '@/lib/download/ytdlp/format-selector';
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
): Promise<string> {
  const r = await invoke<{ outputPath?: string }>('media_convert_fetch_hls', {
    url,
    outputPath,
    headers,
  });
  return String(r?.outputPath || outputPath);
}

function isHlsProtocol(protocol?: string, url?: string): boolean {
  const p = (protocol || '').toLowerCase();
  if (p.includes('m3u8')) return true;
  return /\.m3u8(\?|$)/i.test(url || '');
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

    if (isHlsProtocol(part.protocol, part.url)) {
      downloadedFiles.push(await fetchHlsToFile(part.url, tmp, part.headers));
      continue;
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
  if (downloadedFiles.length >= 2) {
    const out = withFileExt(basePath, mergeExt);
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
  }

  // 可选：旁路下载一条字幕（writeSubs）
  let subPath: string | undefined;
  if (cfg.ytdlp.writeSubs) {
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

  return {
    info: {
      id: engineIds[0] || `ytdlp_${task.id}`,
      status: 'done',
      filepath,
      percent: 100,
    },
    filepath,
    formatId,
    engineIds,
  };
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
    default:
      return undefined;
  }
}
