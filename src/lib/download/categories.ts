/**
 * IDM 风格下载分类目录（英文首字母大写）
 * 默认落在 MediaRoot/Download/<Category>/
 */

export const DOWNLOAD_CATEGORIES = [
  'General',
  'Compressed',
  'Documents',
  'Music',
  'Video',
  'Programs',
] as const;

export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];

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
  // Music
  mp3: 'Music',
  flac: 'Music',
  aac: 'Music',
  m4a: 'Music',
  wav: 'Music',
  wma: 'Music',
  ogg: 'Music',
  opus: 'Music',
  ape: 'Music',
  aiff: 'Music',
  // Video
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

export function classifyDownloadCategory(hints: {
  fileName?: string;
  url?: string;
  title?: string;
  /** ytdlp / 显式媒体类型提示 */
  mediaHint?: 'video' | 'audio' | 'document' | 'archive' | 'program';
  engine?: string;
}): DownloadCategory {
  const candidates = [hints.fileName, hints.title, hints.url].filter(Boolean) as string[];
  for (const c of candidates) {
    const ext = extractExtension(c);
    if (ext && EXT_CATEGORY[ext]) return EXT_CATEGORY[ext];
  }

  switch (hints.mediaHint) {
    case 'video':
      return 'Video';
    case 'audio':
      return 'Music';
    case 'document':
      return 'Documents';
    case 'archive':
      return 'Compressed';
    case 'program':
      return 'Programs';
    default:
      break;
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
