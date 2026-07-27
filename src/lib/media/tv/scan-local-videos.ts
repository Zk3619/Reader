/**
 * 本地视频目录递归扫描（不写 localStorage；供收藏「添加文件夹」使用）
 */

import { readDir, stat } from '@tauri-apps/plugin-fs';
import { isVideoFileName } from '@/lib/media/video/video-file-ext';

export type ScannedLocalVideo = {
  path: string;
  name: string;
  size?: number;
  mtime?: number;
};

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
  out: ScannedLocalVideo[],
  limit: number,
): Promise<void> {
  if (depth > maxDepth || out.length >= limit) return;
  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= limit) return;
    const name = ent.name;
    if (!name || name.startsWith('.')) continue;
    const full = joinPath(dir, name);
    if (ent.isDirectory) {
      await walkDir(full, depth + 1, maxDepth, out, limit);
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
    out.push({ path: full, name, size, mtime });
  }
}

/** 递归扫描单个根目录下的视频文件 */
export async function scanLocalVideoRoot(
  root: string,
  opts?: { maxDepth?: number; limit?: number },
): Promise<ScannedLocalVideo[]> {
  const maxDepth = opts?.maxDepth ?? 5;
  const limit = opts?.limit ?? 2000;
  const out: ScannedLocalVideo[] = [];
  await walkDir(root.trim(), 0, maxDepth, out, limit);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
