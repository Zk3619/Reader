/**
 * IDM 风格下载分类目录（英文首字母大写）
 * 默认落在 MediaRoot/Download/<Category>/
 *
 * 媒体：纯视频 / 音视频 → Video；纯音频 → Audio
 */

export const DOWNLOAD_CATEGORIES = [
  'General',
  'Compressed',
  'Documents',
  'Audio',
  'Video',
  'Programs',
] as const;

export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];

/** 旧版目录名，删除清理 / 迁移时仍识别 */
export const LEGACY_DOWNLOAD_CATEGORIES = ['Music'] as const;

/** 扩展名 → 分类（不含点，小写） */
const EXT_CATEGORY: Record<string, DownloadCategory> = {
  // Compressed
  zip: 'Compressed',
  rar: 'Compressed',
  '7z': 'Compressed',
  tar: 'Compressed',
  gz: 'Compressed',
  tgz: 'Compressed',
  bz2: 'Compressed',
  xz: 'Compressed',
  cab: 'Compressed',
  iso: 'Compressed',
  // Documents
  pdf: 'Documents',
  doc: 'Documents',
  docx: 'Documents',
  xls: 'Documents',
  xlsx: 'Documents',
  ppt: 'Documents',
  pptx: 'Documents',
  txt: 'Documents',
  rtf: 'Documents',
  odt: 'Documents',
  ods: 'Documents',
  odp: 'Documents',
  csv: 'Documents',
  epub: 'Documents',
  mobi: 'Documents',
  azw3: 'Documents',
  md: 'Documents',
  // Audio（纯音频容器）
  mp3: 'Audio',
  flac: 'Audio',
  aac: 'Audio',
  m4a: 'Audio',
  wav: 'Audio',
  wma: 'Audio',
  ogg: 'Audio',
  opus: 'Audio',
  ape: 'Audio',
  aiff: 'Audio',
  // Video（含可带音轨的视频容器）
  mp4: 'Video',
  mkv: 'Video',
  avi: 'Video',
  mov: 'Video',
  wmv: 'Video',
  flv: 'Video',
  webm: 'Video',
  m4v: 'Video',
  mpeg: 'Video',
  mpg: 'Video',
  ts: 'Video',
  m2ts: 'Video',
  // Programs
  exe: 'Programs',
  msi: 'Programs',
  dmg: 'Programs',
  pkg: 'Programs',
  deb: 'Programs',
  rpm: 'Programs',
  apk: 'Programs',
  appx: 'Programs',
  bat: 'Programs',
  cmd: 'Programs',
  ps1: 'Programs',
  sh: 'Programs',
};

function extractExtension(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  let name = raw;
  try {
    if (/^https?:\/\//i.test(raw) || /^ed2k:\/\//i.test(raw) || /^magnet:/i.test(raw)) {
      const u = new URL(raw);
      name = decodeURIComponent(u.pathname.split('/').pop() || '');
    }
  } catch {
    /* keep name */
  }
  name = name.split(/[?#]/)[0] || name;
  name = name.replace(/\\/g, '/').split('/').pop() || name;
  // compound archives
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'gz';
  if (lower.endsWith('.tar.bz2')) return 'bz2';
  if (lower.endsWith('.tar.xz')) return 'xz';
  const m = lower.match(/\.([a-z0-9]{1,8})$/);
  return m?.[1] ?? '';
}

function formatHasVideo(f: Record<string, unknown>): boolean {
  const vc = f.vcodec != null ? String(f.vcodec) : '';
  if (vc && vc !== 'none') return true;
  if (Number(f.height) > 0 || Number(f.width) > 0) return true;
  const vext = f.video_ext != null ? String(f.video_ext) : '';
  if (vext && vext !== 'none') return true;
  return false;
}

function formatHasAudio(f: Record<string, unknown>): boolean {
  const ac = f.acodec != null ? String(f.acodec) : '';
  if (ac === 'none') return false;
  if (ac) return true;
  const vc = f.vcodec != null ? String(f.vcodec) : '';
  if (vc === 'none') return true;
  if (Number(f.abr) > 0 || Number(f.asr) > 0) return true;
  const aext = f.audio_ext != null ? String(f.audio_ext) : '';
  if (aext && aext !== 'none') return true;
  return false;
}

/**
 * 根据已选 / 可选格式判断 ytdlp 媒体类型：
 * - 含视频轨（纯视频或音视频）→ video
 * - 仅音频轨 → audio
 */
export function inferYtdlpMediaHint(meta: {
  requestedFormats?: unknown;
  formats?: unknown;
  formatId?: string;
}): 'video' | 'audio' {
  const requested = Array.isArray(meta.requestedFormats)
    ? (meta.requestedFormats as Record<string, unknown>[])
    : [];
  const formats = Array.isArray(meta.formats) ? (meta.formats as Record<string, unknown>[]) : [];
  const formatId = typeof meta.formatId === 'string' ? meta.formatId.trim() : '';

  let pool = requested.length > 0 ? requested : [];
  if (!pool.length && formatId && formats.length) {
    const ids = formatId.split('+').map((s) => s.trim()).filter(Boolean);
    pool = ids
      .map((id) => formats.find((f) => String(f.format_id || '') === id))
      .filter(Boolean) as Record<string, unknown>[];
  }
  if (!pool.length) pool = formats;

  let anyVideo = false;
  let anyAudio = false;
  for (const f of pool) {
    if (!f || typeof f !== 'object') continue;
    if (formatHasVideo(f)) anyVideo = true;
    if (formatHasAudio(f)) anyAudio = true;
  }

  if (anyVideo) return 'video';
  if (anyAudio) return 'audio';
  // 无编解码信息时：流媒体默认按视频目录
  return 'video';
}

export function classifyDownloadCategory(hints: {
  fileName?: string;
  url?: string;
  title?: string;
  /** ytdlp / 显式媒体类型提示：纯视频与音视频用 video，纯音频用 audio */
  mediaHint?: 'video' | 'audio' | 'document' | 'archive' | 'program';
  engine?: string;
}): DownloadCategory {
  // 显式媒体类型优先（避免标题/扩展名误导纯音频进 Video）
  switch (hints.mediaHint) {
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'document':
      return 'Documents';
    case 'archive':
      return 'Compressed';
    case 'program':
      return 'Programs';
    default:
      break;
  }

  const candidates = [hints.fileName, hints.title, hints.url].filter(Boolean) as string[];
  for (const c of candidates) {
    const ext = extractExtension(c);
    if (ext && EXT_CATEGORY[ext]) return EXT_CATEGORY[ext];
  }

  // 无扩展名时：流媒体引擎默认进 Video
  if (hints.engine === 'ytdlp') return 'Video';
  return 'General';
}

export function downloadCategoryDirName(category: DownloadCategory): string {
  return category;
}

/** 拼接分类子目录（不创建磁盘） */
export function joinDownloadCategoryPath(baseDir: string, category: DownloadCategory): string {
  const base = baseDir.replace(/[/\\]+$/, '');
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${base}${sep}${downloadCategoryDirName(category)}`;
}

function parentDir(path: string): string | null {
  const norm = path.replace(/[/\\]+$/, '');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return null;
  // keep Windows drive root like `D:/`
  if (idx === 2 && /^[a-zA-Z]:/.test(norm)) return norm.slice(0, 3);
  return norm.slice(0, idx);
}

function pathBaseName(path: string): string {
  const norm = path.replace(/[/\\]+$/, '');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function isKnownCategoryDirName(name: string): boolean {
  if ((DOWNLOAD_CATEGORIES as readonly string[]).includes(name)) return true;
  return (LEGACY_DOWNLOAD_CATEGORIES as readonly string[]).includes(name);
}

/**
 * 扩展删除路径：误识别时无扩展名路径曾被建成 `Category/标题/` 子目录，
 * 成片在子目录内；删文件时需连同该任务容器目录一起删掉。
 * 另：多轨工作目录 `{stem}.parts`、旁路 `.part`、遗留 `{stem}.part-*`。
 */
export function expandDownloadDeletePaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const p = String(raw || '').trim();
    if (!p) continue;
    out.add(p);
    const parent = parentDir(p);
    if (!parent) continue;
    const parentName = pathBaseName(parent);
    const grand = parentDir(parent);
    const grandName = grand ? pathBaseName(grand) : '';
    // .../Video/TaskFolder/file.ext → 同时删除 TaskFolder
    if (grandName && isKnownCategoryDirName(grandName) && parentName && !isKnownCategoryDirName(parentName)) {
      out.add(parent);
    }
    // 父目录本身是 `{stem}.parts` 工作目录 → 整夹删除
    if (parentName.endsWith('.parts')) {
      out.add(parent);
    }
  }
  return [...out];
}

/** 去掉末尾扩展名得到路径 stem（无扩展则原样） */
function pathStem(path: string): string {
  const norm = path.replace(/[/\\]+$/, '');
  const parent = parentDir(norm);
  const base = pathBaseName(norm);
  const m = base.match(/^(.*)\.[a-z0-9]{1,8}$/i);
  if (!m?.[1]) return norm;
  return parent ? joinSibling(parent, m[1]) : m[1];
}

function joinSibling(parent: string, name: string): string {
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return `${parent.replace(/[/\\]+$/, '')}${sep}${name}`;
}

/**
 * 收集任务相关本地产物路径（成片、`.part`、多轨 `.parts` 目录、待合并分轨、遗留 flat part-*）。
 * 用于删除进行中 / 暂停 / 出错任务时清掉临时文件。
 */
export async function collectDownloadArtifactPaths(task: {
  filepath?: string;
  meta?: {
    workDir?: unknown;
    pendingMergeOutput?: unknown;
    pendingParts?: unknown;
  };
}): Promise<string[]> {
  const out = new Set<string>();
  const add = (raw?: unknown) => {
    const p = String(raw || '').trim();
    if (p) out.add(p);
  };

  const filepath = String(task.filepath || '').trim();
  add(filepath);
  add(task.meta?.pendingMergeOutput);
  add(task.meta?.workDir);
  if (Array.isArray(task.meta?.pendingParts)) {
    for (const p of task.meta.pendingParts) add(p);
  }

  if (filepath) {
    add(`${filepath}.part`);
    add(`${filepath}.parts`);
    const stem = pathStem(filepath);
    if (stem && stem !== filepath) {
      add(`${stem}.part`);
      add(`${stem}.parts`);
    }
    // 遗留：分类目录下与 stem 同级的 `{stem}.part-*` 文件
    const parent = parentDir(filepath);
    const stemBase = pathBaseName(stem || filepath);
    if (parent && stemBase) {
      try {
        const { readDir } = await import('@tauri-apps/plugin-fs');
        const entries = await readDir(parent);
        const prefix = `${stemBase}.part-`;
        const partsDirName = `${stemBase}.parts`;
        for (const e of entries) {
          const name = String(e.name || '');
          if (!name) continue;
          if (name === partsDirName || name.startsWith(prefix)) {
            add(joinSibling(parent, name));
          }
        }
      } catch {
        /* 目录不存在或无权读取时忽略 */
      }
    }
  }

  return [...out];
}
