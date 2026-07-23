/**
 * 影视本地库扫描（E4 / E2.1c）
 */

import { readDir, stat } from '@tauri-apps/plugin-fs';

export type LocalVideoItem = {
  id: string;
  path: string;
  name: string;
  size?: number;
  mtime?: number;
  root?: string;
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

export function addLocalLibraryRoot(root: string): LocalLibraryState {
  const prev = loadLocalLibraryState();
  const r = root.trim();
  if (!r) return prev;
  const roots = prev.roots.includes(r) ? prev.roots : [...prev.roots, r];
  const next = { ...prev, roots, updatedAt: Date.now() };
  saveLocalLibraryState(next);
  return next;
}

function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  const sep = parent.includes('\\') ? '\\' : '/';
  return parent.endsWith('/') || parent.endsWith('\\')
    ? `${parent}${name}`
    : `${parent}${sep}${name}`;
}

async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
  root: string,
  out: LocalVideoItem[],
  limit: number,
  onProgress?: (found: number, currentDir: string) => void,
): Promise<void> {
  if (depth > maxDepth || out.length >= limit) return;
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return;
  }
  onProgress?.(out.length, dir);
  for (const ent of entries) {
    if (out.length >= limit) return;
    const name = ent.name;
    if (!name || name.startsWith('.')) continue;
    const full = joinPath(dir, name);
    if (ent.isDirectory) {
      await walkDir(full, depth + 1, maxDepth, root, out, limit, onProgress);
      continue;
    }
    if (!isVideoFileName(name)) continue;
    let size: number | undefined;
    let mtime: number | undefined;
    try {
      const st = await stat(full);
      size = typeof st.size === 'number' ? st.size : undefined;
      mtime = st.mtime ? new Date(st.mtime).getTime() : undefined;
    } catch {
      /* */
    }
    out.push({ id: full, path: full, name, size, mtime, root });
    onProgress?.(out.length, dir);
  }
}

/** 递归扫描单个根目录 */
export async function scanLocalVideoRoot(
  root: string,
  opts?: {
    maxDepth?: number;
    limit?: number;
    onProgress?: (found: number, currentDir: string) => void;
  },
): Promise<LocalVideoItem[]> {
  const maxDepth = opts?.maxDepth ?? 5;
  const limit = opts?.limit ?? 2000;
  const out: LocalVideoItem[] = [];
  await walkDir(root.trim(), 0, maxDepth, root.trim(), out, limit, opts?.onProgress);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 扫描全部已登记 roots 并写回库 */
export async function rescanLocalLibraryRoots(opts?: {
  maxDepth?: number;
  limit?: number;
  onProgress?: (info: {
    found: number;
    currentDir: string;
    root: string;
    rootIndex: number;
    rootCount: number;
  }) => void;
}): Promise<LocalLibraryState> {
  const prev = loadLocalLibraryState();
  const map = new Map(prev.items.map((i) => [i.path, i]));
  const roots = prev.roots;
  for (let ri = 0; ri < roots.length; ri++) {
    const root = roots[ri]!;
    const found = await scanLocalVideoRoot(root, {
      maxDepth: opts?.maxDepth,
      limit: opts?.limit,
      onProgress: (n, dir) =>
        opts?.onProgress?.({
          found: n,
          currentDir: dir,
          root,
          rootIndex: ri,
          rootCount: roots.length,
        }),
    });
    for (const it of found) map.set(it.path, it);
  }
  const next: LocalLibraryState = {
    roots: prev.roots,
    items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: Date.now(),
  };
  saveLocalLibraryState(next);
  return next;
}

/** Android��MediaStore ɨ�貢�ϲ������ؿ� */
export async function scanAndroidMediaStoreLibrary(): Promise<LocalLibraryState> {
  const { invoke } = await import('@tauri-apps/api/core');
  const raw = await invoke<{
    items?: Array<{ path: string; name: string; size?: number; dateAdded?: number }>;
    count?: number;
  }>('video_android_scan_media_store');
  const prev = loadLocalLibraryState();
  const map = new Map(prev.items.map((i) => [i.path, i]));
  for (const it of raw.items ?? []) {
    if (!it.path) continue;
    map.set(it.path, {
      id: it.path,
      path: it.path,
      name: it.name || it.path.split(/[/\\]/).pop() || it.path,
      size: it.size,
      mtime: it.dateAdded,
      root: 'mediastore',
    });
  }
  const next: LocalLibraryState = {
    roots: prev.roots.includes('mediastore')
      ? prev.roots
      : [...prev.roots, 'mediastore'],
    items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: Date.now(),
  };
  saveLocalLibraryState(next);
  return next;
}
