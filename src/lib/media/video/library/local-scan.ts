/**
 * 影视本地库扫描（E4）
 */

export type LocalVideoItem = {
  id: string;
  path: string;
  name: string;
  size?: number;
  mtime?: number;
};

const VIDEO_EXT = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'm4v',
  'ts',
  'm2ts',
  'mpg',
  'mpeg',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXT.has(extOf(name));
}

const HISTORY_KEY = 'reader.video.localLibrary.v1';

export type LocalLibraryState = {
  roots: string[];
  items: LocalVideoItem[];
  updatedAt: number;
};

export function loadLocalLibraryState(): LocalLibraryState {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { roots: [], items: [], updatedAt: 0 };
    return { roots: [], items: [], updatedAt: 0, ...JSON.parse(raw) };
  } catch {
    return { roots: [], items: [], updatedAt: 0 };
  }
}

export function saveLocalLibraryState(state: LocalLibraryState): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

/** 将路径列表登记为本地库条目（实际目录遍历由调用方用 fs 插件完成） */
export function upsertLocalVideoPaths(paths: string[]): LocalLibraryState {
  const prev = loadLocalLibraryState();
  const map = new Map(prev.items.map((i) => [i.path, i]));
  for (const p of paths) {
    const path = p.trim();
    if (!path || !isVideoFileName(path)) continue;
    const name = path.split(/[/\\]/).pop() || path;
    map.set(path, {
      id: path,
      path,
      name,
    });
  }
  const next: LocalLibraryState = {
    roots: prev.roots,
    items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: Date.now(),
  };
  saveLocalLibraryState(next);
  return next;
}
