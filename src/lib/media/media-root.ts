import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';

export type MediaModuleKey = 'reading' | 'music' | 'video' | 'subscribe' | 'download';

const MODULE_SUBDIRS: Record<MediaModuleKey, string> = {
  reading: 'Reader',
  music: 'Audio',
  video: 'Video',
  subscribe: 'Subscribe',
  download: 'Download',
};

/** 旧版小写子目录名（迁移用） */
export const LEGACY_MODULE_SUBDIRS: Record<MediaModuleKey, string> = {
  reading: 'reading',
  music: 'music',
  video: 'video',
  subscribe: 'subscribe',
  download: 'download',
};

function normalizePath(input: string | undefined): string {
  return input?.trim() ?? '';
}

async function joinPath(base: string, child: string): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  return join(base, child);
}

export function getModuleSubdir(moduleKey: MediaModuleKey): string {
  return MODULE_SUBDIRS[moduleKey];
}

export async function resolveGlobalMediaRoot(): Promise<string> {
  const configured = normalizePath(settingsStore.state.app.mediaRootDirectory);
  if (configured) return configured;
  if (!isTauri()) return 'Media';
  const appDir = await getAppDataDir();
  return joinPath(appDir, 'Media');
}

function useGlobalForModule(moduleKey: MediaModuleKey): boolean {
  const app = settingsStore.state.app;
  if (moduleKey === 'reading') return app.readingUseGlobalMediaRoot !== false;
  if (moduleKey === 'music') return app.musicUseGlobalMediaRoot !== false;
  if (moduleKey === 'video') return app.videoUseGlobalMediaRoot !== false;
  if (moduleKey === 'download') return app.downloadUseGlobalMediaRoot !== false;
  return true;
}

function getModuleCustomRoot(moduleKey: MediaModuleKey): string {
  const app = settingsStore.state.app;
  if (moduleKey === 'reading') return normalizePath(app.readingMediaRootDirectory);
  if (moduleKey === 'music') return normalizePath(app.musicMediaRootDirectory);
  if (moduleKey === 'video') return normalizePath(app.videoMediaRootDirectory);
  if (moduleKey === 'download') return normalizePath(app.downloadMediaRootDirectory);
  return '';
}

export async function resolveModuleMediaRoot(moduleKey: MediaModuleKey): Promise<string> {
  if (!useGlobalForModule(moduleKey)) {
    const custom = getModuleCustomRoot(moduleKey);
    if (custom) return custom;
  }
  const globalRoot = await resolveGlobalMediaRoot();
  return joinPath(globalRoot, getModuleSubdir(moduleKey));
}

/**
 * 模块下载/导出统一目录。
 * - 一般模块：MediaRoot/<Module>/Download
 * - 下载模块本身子目录已是 Download，不再套一层（MediaRoot/Download）
 */
export async function resolveModuleDownloadDirectory(moduleKey: MediaModuleKey): Promise<string> {
  const moduleRoot = await resolveModuleMediaRoot(moduleKey);
  if (moduleKey === 'download') {
    await ensureDirectory(moduleRoot);
    await migrateLegacyNestedDownloadDir(moduleRoot);
    return moduleRoot;
  }
  const downloadDir = await joinPath(moduleRoot, 'Download');
  await ensureDirectory(downloadDir);
  return downloadDir;
}

/** 旧版 MediaRoot/Download/Download → 按扩展名迁入 IDM 分类目录 */
async function migrateLegacyNestedDownloadDir(moduleRoot: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { exists, readDir, rename, mkdir } = await import('@tauri-apps/plugin-fs');
    const legacy = await joinPath(moduleRoot, 'Download');
    if (!(await exists(legacy))) return;
    const { classifyDownloadCategory, joinDownloadCategoryPath } = await import(
      '@/lib/download/categories'
    );
    const entries = await readDir(legacy);
    for (const entry of entries) {
      if (!entry?.name) continue;
      const src = await joinPath(legacy, entry.name);
      const category = classifyDownloadCategory({ fileName: entry.name });
      const destDir = joinDownloadCategoryPath(moduleRoot, category);
      await mkdir(destDir, { recursive: true });
      const dest = await joinPath(destDir, entry.name);
      if (await exists(dest)) continue;
      try {
        await rename(src, dest);
      } catch {
        /* 跨卷等失败时跳过单项 */
      }
    }
    // 尽量移除空的遗留 Download 目录
    try {
      const left = await readDir(legacy);
      if (left.length === 0) {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(legacy, { recursive: true });
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* 迁移失败不阻断下载 */
  }
}

export async function ensureDirectory(path: string): Promise<void> {
  if (!isTauri()) return;
  const { mkdir } = await import('@tauri-apps/plugin-fs');
  await mkdir(path, { recursive: true });
}
