import { join } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@/lib/platform/detect';
import {
  getModuleSubdir,
  LEGACY_MODULE_SUBDIRS,
  type MediaModuleKey,
} from '@/lib/media/media-root';
import { invalidateAudioCacheDir } from '@/lib/media/audio/audio-disk-cache';
import { invalidateMusicCoverCacheDir } from '@/lib/media/audio/music-cover-disk-cache';
import { invalidateMangaCacheDir } from '@/lib/media/image/image-disk-cache';

const MODULE_CACHE_DIRS: Record<MediaModuleKey, string[]> = {
  reading: ['book-cache', 'image-cache', 'manga-image-cache', 'Books'],
  music: ['audio-cache', 'music-cover-cache', 'Download'],
  video: ['tv', 'Cache', 'tv-py-host', 'tv-py-cache'],
};

function normalizePath(input: string): string {
  return input.replace(/[\\/]+$/, '').toLowerCase();
}

function isSamePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

async function copyTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readDir(sourceDir);
  for (const entry of entries) {
    if (!entry?.name) continue;
    const src = await join(sourceDir, entry.name);
    const dst = await join(targetDir, entry.name);
    if (entry.isDirectory) {
      await copyTree(src, dst);
      continue;
    }
    const bytes = await readFile(src);
    await writeFile(dst, bytes);
  }
}

export async function migrateModuleCaches(
  moduleKey: MediaModuleKey,
  sourceRoot: string,
  targetRoot: string,
): Promise<{ movedDirs: string[] }> {
  if (!isTauri()) return { movedDirs: [] };
  if (!sourceRoot.trim() || !targetRoot.trim()) return { movedDirs: [] };
  if (isSamePath(sourceRoot, targetRoot)) return { movedDirs: [] };

  const movedDirs: string[] = [];
  for (const dirName of MODULE_CACHE_DIRS[moduleKey]) {
    const src = await join(sourceRoot, dirName);
    if (!(await exists(src))) continue;
    const srcStat = await stat(src);
    if (!srcStat.isDirectory) continue;
    const dst = await join(targetRoot, dirName);
    await copyTree(src, dst);
    await remove(src, { recursive: true });
    movedDirs.push(dirName);
  }
  if (movedDirs.length > 0) {
    invalidateModuleRuntimeCache(moduleKey);
  }
  return { movedDirs };
}

/** 迁移书籍库根目录（复制文件后删除旧目录内容） */
export async function migrateBooksRoot(
  sourceRoot: string,
  targetRoot: string,
): Promise<{ movedEntries: number }> {
  if (!isTauri()) return { movedEntries: 0 };
  if (!sourceRoot.trim() || !targetRoot.trim()) return { movedEntries: 0 };
  if (isSamePath(sourceRoot, targetRoot)) return { movedEntries: 0 };
  if (!(await exists(sourceRoot))) return { movedEntries: 0 };

  await mkdir(targetRoot, { recursive: true });
  const entries = await readDir(sourceRoot);
  let movedEntries = 0;
  for (const entry of entries) {
    if (!entry?.name) continue;
    const src = await join(sourceRoot, entry.name);
    const dst = await join(targetRoot, entry.name);
    if (entry.isDirectory) {
      await copyTree(src, dst);
    } else {
      const bytes = await readFile(src);
      await writeFile(dst, bytes);
    }
    await remove(src, { recursive: true });
    movedEntries += 1;
  }
  return { movedEntries };
}

/** 全局 MediaRoot 变更时，兼容旧版小写子目录名 */
export async function migrateModuleCachesWithLegacyNames(
  moduleKey: MediaModuleKey,
  sourceGlobalRoot: string,
  targetGlobalRoot: string,
): Promise<{ movedDirs: string[] }> {
  const legacy = LEGACY_MODULE_SUBDIRS[moduleKey];
  const modern = getModuleSubdir(moduleKey);
  const fromLegacy = await join(sourceGlobalRoot, legacy);
  const fromModern = await join(sourceGlobalRoot, modern);
  const toModern = await join(targetGlobalRoot, modern);

  const primary = await migrateModuleCaches(moduleKey, fromModern, toModern);
  if (legacy !== modern && !(await isSamePathResolved(fromLegacy, fromModern))) {
    const legacyResult = await migrateModuleCaches(moduleKey, fromLegacy, toModern);
    return { movedDirs: [...primary.movedDirs, ...legacyResult.movedDirs] };
  }
  return primary;
}

async function isSamePathResolved(a: string, b: string): Promise<boolean> {
  if (isSamePath(a, b)) return true;
  try {
    const { normalize } = await import('@tauri-apps/api/path');
    return (await normalize(a)).toLowerCase() === (await normalize(b)).toLowerCase();
  } catch {
    return false;
  }
}

export function invalidateModuleRuntimeCache(moduleKey: MediaModuleKey): void {
  if (moduleKey === 'reading') {
    invalidateMangaCacheDir();
    return;
  }
  if (moduleKey === 'music') {
    invalidateAudioCacheDir();
    invalidateMusicCoverCacheDir();
    return;
  }
  /* video caches resolve path per call */
}
