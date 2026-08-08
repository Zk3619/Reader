/**
 * 下载门面：probe / 任务 CRUD，按引擎路由
 */

import {
  type DownloadEngineKind,
  type DownloadTask,
  type ResolveResult,
} from '@/lib/download/task-model';
import { detectProtocol, resolveUrl } from '@/lib/download/gopeed/resolve';
import {
  getTaskQueue,
  type CreateTaskOptions,
  type TaskQueue,
} from '@/lib/download/gopeed/queue';
import {
  getExtensionHost,
  type ExtensionHost,
} from '@/lib/download/gopeed/extensions/host';
import { getDownloadConfig } from '@/lib/download/gopeed/config';
import { estimateYtdlpTotalBytes } from '@/lib/download/gopeed/engine-bridge';
import { YoutubeDL } from '@/lib/download/ytdlp';
import {
  classifyDownloadCategory,
  inferYtdlpMediaHint,
  joinDownloadCategoryPath,
} from '@/lib/download/categories';
import { resolveModuleDownloadDirectory, ensureDirectory } from '@/lib/media/media-root';
import { logDownloadError } from '@/lib/download/error-message';

export interface ProbeOptions {
  labels?: Record<string, string>;
  /** 跳过扩展 onResolve */
  skipExtensions?: boolean;
  /** 跳过 ytdlp extract_info */
  skipYtdlp?: boolean;
}

export interface DownloadServiceOptions {
  queue?: TaskQueue;
  extensions?: ExtensionHost;
}

export interface CreateDownloadTaskOptions extends CreateTaskOptions {
  engine?: DownloadEngineKind;
}

function resolveFromExtensionRes(
  url: string,
  res: NonNullable<Awaited<ReturnType<ExtensionHost['triggerOnResolve']>>>['res'],
): ResolveResult | null {
  if (!res) return null;
  const files = res.files?.map((f) => ({
    name: f.name,
    size: f.size,
    selected: f.selected !== false,
  }));
  const size =
    typeof res.size === 'number' && res.size > 0
      ? res.size
      : files?.reduce((s, f) => s + (f.size || 0), 0) || 0;
  return {
    name: res.name || url,
    size,
    files,
    protocol: 'http',
  };
}

async function extractInfoYtdlp(url: string): Promise<ResolveResult | null> {
  try {
    const ydl = new YoutubeDL({ quiet: true, noplaylist: true, format: 'bv*+ba/b' });
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
      (sum, f) => sum + formatBytes(f as { filesize?: unknown; filesize_approx?: unknown; tbr?: unknown }),
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

function pickEngine(url: string, preferred?: DownloadEngineKind): DownloadEngineKind {
  if (preferred) return preferred;
  const detected = detectProtocol(url);
  if (detected === 'ytdlp') return 'ytdlp';
  return 'gopeed';
}

export class DownloadService {
  readonly queue: TaskQueue;
  readonly extensions: ExtensionHost;

  constructor(opts: DownloadServiceOptions = {}) {
    this.queue = opts.queue ?? getTaskQueue();
    this.extensions = opts.extensions ?? getExtensionHost();
  }

  /**
   * 探测资源：扩展 onResolve → ytdlp extract_info → gopeed resolve
   */
  async probe(url: string, opts: ProbeOptions = {}): Promise<ResolveResult> {
    const trimmed = (url || '').trim();
    if (!trimmed) throw new Error('probe: url is empty');

    if (!opts.skipExtensions) {
      try {
        const ctx = await this.extensions.triggerOnResolve(trimmed, opts.labels);
        const fromExt = resolveFromExtensionRes(trimmed, ctx?.res ?? null);
        if (fromExt) return fromExt;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/requires Tauri|not found|unknown command/i.test(msg)) {
          throw e;
        }
      }
    }

    const detected = detectProtocol(trimmed);
    if (!opts.skipYtdlp && (detected === 'ytdlp' || detected === 'http')) {
      try {
        const { getExtractorForUrl, ensureBuiltinLoaded } = await import('@/lib/download/ytdlp');
        ensureBuiltinLoaded();
        const ie = getExtractorForUrl(trimmed);
        if (ie && ie.constructor.name !== 'GenericIE') {
          const y = await extractInfoYtdlp(trimmed);
          if (y) return y;
        } else if (detected === 'ytdlp') {
          const y = await extractInfoYtdlp(trimmed);
          if (y) return y;
        }
      } catch (e) {
        if (detected === 'ytdlp') throw e;
      }
    }

    return resolveUrl(trimmed);
  }

  async createTask(opts: CreateDownloadTaskOptions): Promise<DownloadTask> {
    const url = (opts.url || '').trim();
    if (!url) throw new Error('createTask: url is required');

    const cfg = await getDownloadConfig();
    this.queue.setMaxRunning(cfg.maxRunning);

    let engine = pickEngine(url, opts.engine);
    let title = opts.title;
    let meta = { ...(opts.meta ?? {}) };
    let probedSize = 0;

    // 创建前必须探测：404 / 连接失败直接拦截，不入队
    try {
      const resolved = await this.probe(url, {
        labels: meta.labels as Record<string, string> | undefined,
        // 强制通用下载时跳过站点提取，但仍会走 resolve 探测可达性
        skipYtdlp: opts.engine === 'gopeed',
      });
      title = title || resolved.name;
      probedSize = Number(resolved.size) || 0;
      const fileCount = Array.isArray(resolved.files) ? resolved.files.length : 0;
      meta = {
        ...meta,
        protocol: resolved.protocol,
        ...(resolved.meta ?? {}),
        ...(probedSize > 0 ? { size: probedSize } : {}),
        ...(fileCount > 0 ? { files: resolved.files } : {}),
        ...(resolved.protocol === 'bt' || fileCount > 1 ? { multiFile: true } : {}),
      };
    } catch (e) {
      throw new Error(logDownloadError('createTask probe', e, { url }));
    }

    // Probe/传入 meta 已标明 ytdlp 时，自动模式必须走媒体提取（如 zhihu 页本身 403）
    if (!opts.engine && meta.protocol === 'ytdlp') {
      engine = 'ytdlp';
    }

    if (engine === 'ytdlp') {
      const formats = Array.isArray(meta.formats) ? meta.formats : [];
      const requested = Array.isArray(meta.requestedFormats) ? meta.requestedFormats : [];
      const hasUrl =
        requested.some((f: { url?: string }) => !!f?.url) ||
        formats.some((f: { url?: string }) => !!f?.url);
      if (!hasUrl) {
        throw new Error('未能解析到可下载的视频地址');
      }
    }

    // 空 downloadDir = 跟随模块 MediaRoot/Download；非空为绝对路径覆盖。
    // 未显式 filepath 时按 IDM 分类写入子目录（General/Compressed/…）。
    let downloadDir = cfg.downloadDir?.trim();
    if (!downloadDir) {
      try {
        downloadDir = await resolveModuleDownloadDirectory('download');
      } catch {
        downloadDir = '';
      }
    }

    const safeTitle = (title || 'download').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);
    let filepath = opts.filepath;
    if (!filepath) {
      if (downloadDir) {
        const category = classifyDownloadCategory({
          fileName: safeTitle,
          title: title || undefined,
          url,
          engine,
          mediaHint:
            engine === 'ytdlp' || meta.protocol === 'ytdlp'
              ? inferYtdlpMediaHint(meta)
              : undefined,
        });
        const categoryDir = joinDownloadCategoryPath(downloadDir, category);
        try {
          await ensureDirectory(categoryDir);
        } catch {
          /* web / 权限 */
        }
        filepath = `${categoryDir.replace(/[/\\]$/, '')}/${safeTitle}`;
      } else {
        filepath = safeTitle;
      }
    }

    let total = opts.total ?? 0;
    if (!(total > 0) && engine === 'ytdlp') {
      total = estimateYtdlpTotalBytes(meta);
    }
    if (!(total > 0) && probedSize > 0) total = probedSize;
    if (!(total > 0)) {
      const fromMeta = Number((meta as { size?: unknown }).size ?? 0) || 0;
      if (fromMeta > 0) total = fromMeta;
    }

    const task = await this.queue.create({
      ...opts,
      url,
      title: title || url,
      engine,
      filepath,
      meta,
      total,
      autoStart: opts.autoStart,
    });

    if (engine === 'gopeed' || engine === 'extension') {
      void this.extensions.triggerTaskEvent('onStart', {
        task: {
          id: task.id,
          url: task.url,
          title: task.title,
          state: task.state,
          filepath: task.filepath,
          error: task.error,
          meta: task.meta,
        },
      });
    }

    return task;
  }

  pause(id: string): Promise<DownloadTask | null> {
    return this.queue.pause(id);
  }

  resume(id: string): Promise<DownloadTask | null> {
    return this.queue.resume(id);
  }

  delete(id: string, opts?: { deleteFiles?: boolean }): Promise<boolean> {
    return this.queue.delete(id, opts);
  }

  deleteMany(ids: string[], opts?: { deleteFiles?: boolean }): Promise<number> {
    return this.queue.deleteMany(ids, opts);
  }

  list(): DownloadTask[] {
    return this.queue.list();
  }

  get(id: string): DownloadTask | undefined {
    return this.queue.get(id);
  }
}

let sharedService: DownloadService | null = null;

export function getDownloadService(opts?: DownloadServiceOptions): DownloadService {
  if (!sharedService) {
    sharedService = new DownloadService(opts);
  }
  return sharedService;
}

export function resetDownloadServiceForTests(): void {
  sharedService = null;
}
