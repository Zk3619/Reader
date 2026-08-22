/**
 * 统一下载质量选择：视频画质 / 音质 / 图片质量（对齐 yt-dlp format 选择器）
 */

import type { Format } from '@/lib/download/ytdlp/types';
import { resolveFormatHeight, selectBestFormat } from '@/lib/download/ytdlp/format-selector';

/** 视频分辨率档（用于判断某档是否真有对应轨） */
const VIDEO_HEIGHT_STEPS = [360, 480, 720, 1080, 2160] as const;

function qualityHeight(f: Format): number {
  return resolveFormatHeight(f) ?? 0;
}

function lowerHeightStep(maxHeight: number): number {
  const idx = VIDEO_HEIGHT_STEPS.indexOf(maxHeight as (typeof VIDEO_HEIGHT_STEPS)[number]);
  if (idx <= 0) return 0;
  return VIDEO_HEIGHT_STEPS[idx - 1] ?? 0;
}

export type DownloadMediaKind = 'video' | 'audio' | 'image';

/**
 * 质量档位 id。
 * - 视频：best / 分辨率数字（兼容旧 meta.qualityPreset）
 * - 音频：audio / audio-*（audio 兼容旧「仅音频」）
 * - 图片：image-*（为图片站点预留）
 */
export type DownloadQualityPreset =
  | 'best'
  | '2160'
  | '1080'
  | '720'
  | '480'
  | '360'
  | 'audio'
  | 'audio-best'
  | 'audio-320'
  | 'audio-256'
  | 'audio-192'
  | 'audio-128'
  | 'audio-64'
  | 'image-original'
  | 'image-2048'
  | 'image-1024'
  | 'image-640';

export interface DownloadQualityOption {
  id: DownloadQualityPreset;
  kind: DownloadMediaKind;
  label: string;
  description?: string;
  /** yt-dlp format 字符串；图片档可能为空，改走 pickImageFormat */
  formatSpec: string;
  /** 用于按片源能力过滤 */
  maxHeight?: number;
  maxAbr?: number;
  maxWidth?: number;
}

export interface DownloadFormatCapabilities {
  hasVideo: boolean;
  hasAudio: boolean;
  hasImage: boolean;
  maxHeight: number;
  maxAbr: number;
  maxWidth: number;
}

export interface DownloadQualityPickResult {
  formatId?: string;
  requestedFormats: Format[];
  formatSpec: string;
  kind: DownloadMediaKind;
  preset: DownloadQualityPreset;
}

const IMAGE_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp',
  'tiff',
  'tif',
  'svg',
  'jxl',
  'heic',
  'heif',
]);

export const DOWNLOAD_QUALITY_OPTIONS: readonly DownloadQualityOption[] = [
  // —— 视频 ——
  {
    id: 'best',
    kind: 'video',
    label: '最佳画质',
    description: '最高分辨率视频 + 最佳音轨',
    formatSpec: 'bv*+ba/b',
  },
  {
    id: '2160',
    kind: 'video',
    label: '2160p (4K)',
    // 对齐 yt-dlp 常用写法：仅保留带 height 上限的候选，禁止 /wv*+ba/w 无上限回退
    formatSpec: 'bv*[height<=2160]+ba/b[height<=2160]',
    maxHeight: 2160,
  },
  {
    id: '1080',
    kind: 'video',
    label: '1080p',
    formatSpec: 'bv*[height<=1080]+ba/b[height<=1080]',
    maxHeight: 1080,
  },
  {
    id: '720',
    kind: 'video',
    label: '720p',
    formatSpec: 'bv*[height<=720]+ba/b[height<=720]',
    maxHeight: 720,
  },
  {
    id: '480',
    kind: 'video',
    label: '480p',
    formatSpec: 'bv*[height<=480]+ba/b[height<=480]',
    maxHeight: 480,
  },
  {
    id: '360',
    kind: 'video',
    label: '360p',
    formatSpec: 'bv*[height<=360]+ba/b[height<=360]',
    maxHeight: 360,
  },
  // —— 音频 ——
  {
    id: 'audio-best',
    kind: 'audio',
    label: '最佳音质',
    description: '可用的最高码率音轨',
    formatSpec: 'ba/b',
  },
  {
    id: 'audio',
    kind: 'audio',
    label: '仅音频（最佳）',
    description: '兼容旧选项，等同最佳音质',
    formatSpec: 'ba/b',
  },
  {
    id: 'audio-320',
    kind: 'audio',
    label: '320 kbps',
    formatSpec: 'ba[abr<=320]/ba/b',
    maxAbr: 320,
  },
  {
    id: 'audio-256',
    kind: 'audio',
    label: '256 kbps',
    formatSpec: 'ba[abr<=256]/ba/b',
    maxAbr: 256,
  },
  {
    id: 'audio-192',
    kind: 'audio',
    label: '192 kbps',
    formatSpec: 'ba[abr<=192]/ba/b',
    maxAbr: 192,
  },
  {
    id: 'audio-128',
    kind: 'audio',
    label: '128 kbps',
    formatSpec: 'ba[abr<=128]/ba/b',
    maxAbr: 128,
  },
  {
    id: 'audio-64',
    kind: 'audio',
    label: '64 kbps',
    formatSpec: 'ba[abr<=64]/ba/b',
    maxAbr: 64,
  },
  // —— 图片（图片站点解析接入后使用）——
  {
    id: 'image-original',
    kind: 'image',
    label: '原图',
    description: '最大可用尺寸',
    formatSpec: '',
  },
  {
    id: 'image-2048',
    kind: 'image',
    label: '长边 ≤ 2048',
    formatSpec: '',
    maxWidth: 2048,
  },
  {
    id: 'image-1024',
    kind: 'image',
    label: '长边 ≤ 1024',
    formatSpec: '',
    maxWidth: 1024,
  },
  {
    id: 'image-640',
    kind: 'image',
    label: '长边 ≤ 640',
    formatSpec: '',
    maxWidth: 640,
  },
] as const;

const KIND_ORDER: DownloadMediaKind[] = ['video', 'audio', 'image'];

const KIND_LABEL: Record<DownloadMediaKind, string> = {
  video: '视频',
  audio: '音频',
  image: '图片',
};

export function mediaKindLabel(kind: DownloadMediaKind): string {
  return KIND_LABEL[kind];
}

export function findQualityOption(preset: DownloadQualityPreset): DownloadQualityOption | undefined {
  return DOWNLOAD_QUALITY_OPTIONS.find((o) => o.id === preset);
}

export function formatSpecForQuality(preset: DownloadQualityPreset): string {
  const opt = findQualityOption(preset);
  if (!opt) return 'bv*+ba/b';
  if (opt.kind === 'image') return opt.formatSpec;
  return opt.formatSpec || 'bv*+ba/b';
}

export function labelForQuality(preset: DownloadQualityPreset): string {
  return findQualityOption(preset)?.label ?? '最佳质量';
}

export function kindForQuality(preset: DownloadQualityPreset): DownloadMediaKind {
  return findQualityOption(preset)?.kind ?? 'video';
}

function hasVideoTrack(f: Format): boolean {
  if (f.vcodec && f.vcodec !== 'none') return true;
  // vcodec 明确为 none 时不是视频（可能是纯音频或图片）
  if (f.vcodec === 'none') return false;
  return Number(f.height) > 0;
}

function hasAudioTrack(f: Format): boolean {
  if (f.acodec === 'none') return false;
  if (f.acodec) return true;
  if (f.vcodec === 'none') return Number(f.abr) > 0 || Number(f.asr) > 0;
  return Number(f.abr) > 0 || Number(f.asr) > 0;
}

/** 音视频容器 / 流媒体扩展名：即使缺 vcodec 也绝不当图片（如优酷 m3u8 + ext=mp4） */
const AV_EXTS = new Set([
  'mp4',
  'webm',
  'mkv',
  'flv',
  'mov',
  'ts',
  'm4s',
  'm4a',
  'mp3',
  'opus',
  'flac',
  'ogg',
  'wav',
  'aac',
  'm3u8',
  'mpd',
]);

function looksLikeAvStream(f: Format): boolean {
  const ext = String(f.ext || '').toLowerCase().replace(/^\./, '');
  if (AV_EXTS.has(ext)) return true;
  const protocol = String(f.protocol || '').toLowerCase();
  if (/m3u8|dash|f4m|rtmp|ism|http_dash|hls/.test(protocol)) return true;
  const url = String(f.url || '');
  // 优酷等：…/playlist/m3u8?vid=… 无 .m3u8 后缀
  if (/\.(m3u8|mpd|mp4|webm|m4a|mp3|opus|flac)(\?|$)/i.test(url)) return true;
  if (/\/m3u8(?:\?|$|\/)|manifest\.mpd|[?&]format=m3u8\b/i.test(url)) return true;
  return false;
}

export function isImageFormat(f: Format): boolean {
  if (looksLikeAvStream(f)) return false;
  const ext = String(f.ext || '').toLowerCase().replace(/^\./, '');
  if (IMAGE_EXTS.has(ext)) return true;
  const note = String(f.format_note || f.format || '').toLowerCase();
  if (/\b(image|thumbnail|cover|poster)\b/.test(note)) return true;
  // 无音视频编解码、但有宽高 → 视为图片轨（预留给图片站点）
  const noAv =
    (!f.vcodec || f.vcodec === 'none') &&
    (!f.acodec || f.acodec === 'none');
  return noAv && (Number(f.width) > 0 || Number(f.height) > 0);
}

function longEdge(f: Format): number {
  return Math.max(Number(f.width) || 0, Number(f.height) || 0);
}

export function analyzeFormatCapabilities(formats: Format[]): DownloadFormatCapabilities {
  let hasVideo = false;
  let hasAudio = false;
  let hasImage = false;
  let maxHeight = 0;
  let maxAbr = 0;
  let maxWidth = 0;
  for (const f of formats) {
    if (isImageFormat(f)) {
      hasImage = true;
      maxWidth = Math.max(maxWidth, longEdge(f));
      continue;
    }
    if (hasVideoTrack(f)) {
      hasVideo = true;
      maxHeight = Math.max(maxHeight, qualityHeight(f));
    }
    if (hasAudioTrack(f)) {
      hasAudio = true;
      maxAbr = Math.max(maxAbr, Number(f.abr) || Number(f.tbr) || 0);
    }
  }
  return { hasVideo, hasAudio, hasImage, maxHeight, maxAbr, maxWidth };
}

function optionVisible(
  opt: DownloadQualityOption,
  caps: DownloadFormatCapabilities,
  formats: Format[],
): boolean {
  // 弹窗里「仅音频」与「最佳音质」重复时只保留 audio-best
  if (opt.id === 'audio') return false;

  if (opt.kind === 'video') {
    if (!caps.hasVideo) return false;
    if (opt.id === 'best') return true;
    if (opt.maxHeight != null) {
      // 仅当存在清晰度落在 (上一档, 本档] 的真实视频轨时展示，避免假分档全回退到同一 URL
      const lower = lowerHeightStep(opt.maxHeight);
      return formats.some((f) => {
        if (isImageFormat(f) || !hasVideoTrack(f)) return false;
        const qh = qualityHeight(f);
        return qh > lower && qh <= opt.maxHeight!;
      });
    }
    return true;
  }
  if (opt.kind === 'audio') {
    if (!caps.hasAudio) return false;
    if (opt.id === 'audio-best') return true;
    if (opt.maxAbr != null && caps.maxAbr > 0) {
      return opt.maxAbr <= caps.maxAbr + 32;
    }
    return true;
  }
  // image
  if (!caps.hasImage) return false;
  if (opt.id === 'image-original') return true;
  if (opt.maxWidth != null && caps.maxWidth > 0) {
    return opt.maxWidth <= caps.maxWidth + 64;
  }
  return true;
}

/** 按 formats 能力列出可选项（分组前扁平列表） */
export function listAvailableQualityOptions(formats: Format[]): DownloadQualityOption[] {
  if (!formats.length) {
    // 尚未解析：默认给出视频 + 音频常用档，图片档在无能力时仍展示原图入口供未来站点
    return DOWNLOAD_QUALITY_OPTIONS.filter(
      (o) =>
        o.kind === 'video' ||
        o.id === 'audio-best' ||
        o.id === 'audio-320' ||
        o.id === 'audio-128' ||
        o.id === 'image-original',
    );
  }
  const caps = analyzeFormatCapabilities(formats);
  // 纯图片源：只显示图片；纯音频：只显示音频；否则按能力组合
  let opts = DOWNLOAD_QUALITY_OPTIONS.filter((o) => optionVisible(o, caps, formats));
  // 视频仅一档真实分辨率时只保留「最佳画质」，避免 best+720 被当成两种可选
  const videoHeightOpts = opts.filter((o) => o.kind === 'video' && o.id !== 'best');
  if (videoHeightOpts.length === 1) {
    opts = opts.filter((o) => !(o.kind === 'video' && o.id !== 'best'));
  }
  return opts;
}

/** 多于一种可选项时才需要弹窗选质量 */
export function shouldPromptQualityPick(formats: Format[]): boolean {
  const opts = listAvailableQualityOptions(formats);
  const video = opts.filter((o) => o.kind === 'video');
  // 仅一种画质（含「最佳」折叠后只剩一档）→ 不弹窗，直接下最佳
  if (video.length > 0) return video.length > 1;
  // 无视频：音/图多于一档才选
  return opts.length > 1;
}

export interface DownloadQualityGroup {
  kind: DownloadMediaKind;
  label: string;
  options: DownloadQualityOption[];
}

/** 按媒体类型分组，供弹窗分区渲染 */
export function listAvailableQualityGroups(formats: Format[]): DownloadQualityGroup[] {
  const flat = listAvailableQualityOptions(formats);
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    options: flat.filter((o) => o.kind === kind),
  })).filter((g) => g.options.length > 0);
}

/** 根据能力选默认档位 */
export function defaultQualityPreset(formats: Format[]): DownloadQualityPreset {
  const caps = analyzeFormatCapabilities(formats);
  if (caps.hasVideo) return 'best';
  if (caps.hasAudio) return 'audio-best';
  if (caps.hasImage) return 'image-original';
  return 'best';
}

function pickImageFormat(formats: Format[], maxWidth?: number): Format | null {
  const images = formats.filter(isImageFormat).filter((f) => !!f.url);
  if (!images.length) return null;
  const ranked = [...images].sort((a, b) => longEdge(b) - longEdge(a));
  if (maxWidth == null || maxWidth <= 0) return ranked[0] ?? null;
  const within = ranked.filter((f) => longEdge(f) <= maxWidth);
  return within[0] ?? ranked[ranked.length - 1] ?? null;
}

/** 根据档位从 formats 选出下载轨 */
export function pickFormatsForQuality(
  formats: Format[],
  preset: DownloadQualityPreset,
): DownloadQualityPickResult | null {
  const opt = findQualityOption(preset);
  if (!opt) return null;

  if (opt.kind === 'image') {
    const img = pickImageFormat(formats, opt.maxWidth);
    if (!img) return null;
    return {
      formatId: img.format_id,
      requestedFormats: [img],
      formatSpec: img.format_id ? String(img.format_id) : '',
      kind: 'image',
      preset,
    };
  }

  // Google Drive：videoplayback 签名绑定出口 IP，优先 source（usercontent，无 ip=）
  const hasDriveSource = formats.some(
    (f) =>
      String(f.format_id || '').toLowerCase() === 'source' &&
      /drive\.usercontent\.google\.com|googleusercontent\.com/i.test(String(f.url || '')),
  );
  let formatSpec = opt.formatSpec || (opt.kind === 'audio' ? 'ba/b' : 'bv*+ba/b');
  if (hasDriveSource && opt.kind === 'video' && (preset === 'best' || !opt.maxHeight)) {
    formatSpec = `source/${formatSpec}`;
  }

  const picked = selectBestFormat(formats, formatSpec);
  if (!picked) return null;
  let requestedFormats =
    Array.isArray(picked.requested_formats) && picked.requested_formats.length > 0
      ? picked.requested_formats
      : [picked];

  // 二次校验：视频档不得选出超过目标清晰度（短边）的轨
  if (opt.kind === 'video' && opt.maxHeight != null && opt.maxHeight > 0) {
    const over = requestedFormats.some(
      (f) => hasVideoTrack(f) && qualityHeight(f) > 0 && qualityHeight(f) > opt.maxHeight!,
    );
    if (over) {
      const limited = formats.filter((f) => {
        if (!hasVideoTrack(f)) return true;
        const h = qualityHeight(f);
        return h > 0 && h <= opt.maxHeight!;
      });
      const retry =
        selectBestFormat(limited, formatSpec) ||
        selectBestFormat(limited, `bv*[height<=${opt.maxHeight}]+ba/b[height<=${opt.maxHeight}]`) ||
        selectBestFormat(limited, `b[height<=${opt.maxHeight}]`);
      if (!retry) return null;
      requestedFormats =
        Array.isArray(retry.requested_formats) && retry.requested_formats.length > 0
          ? retry.requested_formats
          : [retry];
      return {
        formatId: retry.format_id,
        requestedFormats,
        formatSpec,
        kind: opt.kind,
        preset,
      };
    }
  }

  return {
    formatId: picked.format_id,
    requestedFormats,
    formatSpec,
    kind: opt.kind,
    preset,
  };
}
