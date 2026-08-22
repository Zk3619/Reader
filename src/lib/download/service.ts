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
import {
  classifyDownloadCategory,
  inferYtdlpMediaHint,
  joinDownloadCategoryPath,
} from '@/lib/download/categories';
import { resolveModuleDownloadDirectory, ensureDirectory } from '@/lib/media/media-root';
import { logDownloadError } from '@/lib/download/error-message';
import { extractInfoYtdlp } from '@/lib/download/ytdlp-extract';

export { refreshYtdlpMediaMeta } from '@/lib/download/ytdlp-extract';

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

function pickEngine(url: string, preferred?: DownloadEngineKind): DownloadEngineKind {
  if (preferred) return preferred;
  const detected = detectProtocol(url);
  if (detected === 'ytdlp') return 'ytdlp';
  return 'gopeed';
}

function isGenericExtractor(ie: { IE_NAME?: string; constructor?: { name?: string } } | null): boolean {
  if (!ie) return true;
  const name = String(ie.IE_NAME || ie.constructor?.name || '').toLowerCase();
  return name === 'generic' || name === 'genericie';
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

    // 先加载提取器注册表，否则 detectProtocol 无法把 YouTube 等判为 ytdlp
    if (!opts.skipYtdlp) {
      try {
        const { ensureBuiltinLoaded } = await import('@/lib/download/ytdlp');
        ensureBuiltinLoaded();
      } catch {
        /* ignore */
      }
    }

    let extensionFallback: ResolveResult | null = null;
    if (!opts.skipExtensions) {
      try {
        const ctx = await this.extensions.triggerOnResolve(trimmed, opts.labels);
        const fromExt = resolveFromExtensionRes(trimmed, ctx?.res ?? null);
        if (fromExt) {
          // 站点媒体 URL：扩展结果通常没有 formats，不能在这里短路，否则创建页无法弹出质量选择
          const detectedEarly = detectProtocol(trimmed);
          if (detectedEarly === 'ytdlp' && !opts.skipYtdlp) {
            extensionFallback = fromExt;
          } else {
            return fromExt;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/requires Tauri|not found|unknown command/i.test(msg)) {
          throw e;
        }
      }
    }

    const detected = detectProtocol(trimmed);
    if (!opts.skipYtdlp && (detected === 'ytdlp' || detected === 'http')) {
      let matchedSiteIe = false;
      try {
        const { getExtractorForUrl } = await import('@/lib/download/ytdlp');
        const ie = getExtractorForUrl(trimmed);
        matchedSiteIe = !isGenericExtractor(ie);
        if (matchedSiteIe || detected === 'ytdlp') {
          const y = await extractInfoYtdlp(trimmed);
          if (y) return y;
          // 站点 IE 已匹配但未解析出流：禁止静默落到「通用下载」把 HTML 当下完
          if (matchedSiteIe) {
            throw new Error('未能解析到可下载的视频地址');
          }
        }
      } catch (e) {
        if (extensionFallback) return extensionFallback;
        if (detected === 'ytdlp' || matchedSiteIe) throw e;
      }
    }

    if (extensionFallback) return extensionFallback;
    return resolveUrl(trimmed);
  }

  async createTask(opts: CreateDownloadTaskOptions): Promise<DownloadTask> {
    const url = (opts.url || '').trim();
    if (!url) throw new Error('createTask: url is required');

    const cfg = await getDownloadConfig();
    this.queue.setMaxRunning(cfg.maxRunning);

    // 创建前先加载提取器注册表，使 detectProtocol / pickEngine 能按 VALID_URL 识别全量站点
    if (!opts.engine) {
      try {
        await import('@/lib/download/ytdlp');
      } catch {
        /* ignore — probe 内还会再试 */
      }
    }

    let engine = pickEngine(url, opts.engine);
    let title = opts.title;
    let meta = { ...(opts.meta ?? {}) };
    let probedSize = 0;

    // 用户在创建前选定的画质（probe 会覆盖 meta，需事后按 qualityPreset / formatSpec 重选）
    const userFormatSpec =
      typeof meta.formatSpec === 'string' && meta.formatSpec.trim()
        ? meta.formatSpec.trim()
        : undefined;
    const userFormatId =
      typeof meta.formatId === 'string' && meta.formatId.trim()
        ? meta.formatId.trim()
        : undefined;
    const userRequestedFormats = Array.isArray(meta.requestedFormats)
      ? meta.requestedFormats
      : undefined;
    const userQualityPreset =
      typeof meta.qualityPreset === 'string' && meta.qualityPreset.trim()
        ? (meta.qualityPreset.trim() as import('@/lib/download/download-quality').DownloadQualityPreset)
        : undefined;

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

    // 按用户画质在最新 formats 上重选。
    // 注意：probe 默认 bv*+ba 会写入 requestedFormats；重选失败时必须恢复用户预选，绝不能留下「最佳」。
    const formats = Array.isArray(meta.formats)
      ? (meta.formats as import('@/lib/download/ytdlp/types').Format[])
      : [];
    let appliedUserQuality = false;
    if (formats.length > 0 && (userQualityPreset || userFormatSpec)) {
      try {
        const { pickFormatsForQuality, formatSpecForQuality } = await import(
          '@/lib/download/download-quality'
        );
        const { selectBestFormat } = await import('@/lib/download/ytdlp/format-selector');
        const preset = userQualityPreset;
        const picked = preset ? pickFormatsForQuality(formats, preset) : null;
        if (picked?.requestedFormats?.length) {
          meta.formatSpec = picked.formatSpec || userFormatSpec || formatSpecForQuality(preset!);
          meta.formatId = picked.formatId;
          meta.requestedFormats = picked.requestedFormats;
          meta.qualityPreset = preset ?? meta.qualityPreset;
          appliedUserQuality = true;
        } else if (userFormatSpec) {
          const viaSpec = selectBestFormat(formats, userFormatSpec);
          if (viaSpec) {
            meta.formatSpec = userFormatSpec;
            meta.formatId = viaSpec.format_id;
            meta.requestedFormats =
              Array.isArray(viaSpec.requested_formats) && viaSpec.requested_formats.length > 0
                ? viaSpec.requested_formats
                : [viaSpec];
            appliedUserQuality = true;
          }
        }
      } catch {
        /* fall through to restore */
      }
    }
    if (!appliedUserQuality) {
      if (userRequestedFormats && userRequestedFormats.length > 0) {
        meta.requestedFormats = userRequestedFormats;
        if (userFormatId) meta.formatId = userFormatId;
        if (userFormatSpec) meta.formatSpec = userFormatSpec;
        if (userQualityPreset) meta.qualityPreset = userQualityPreset;
      } else if (userFormatId) {
        meta.formatId = userFormatId;
        if (userFormatSpec) meta.formatSpec = userFormatSpec;
      } else if (userFormatSpec) {
        meta.formatSpec = userFormatSpec;
      }
      if (userQualityPreset) meta.qualityPreset = userQualityPreset;
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
