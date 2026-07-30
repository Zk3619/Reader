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
  return true;
}

function getModuleCustomRoot(moduleKey: MediaModuleKey): string {
  const app = settingsStore.state.app;
  if (moduleKey === 'reading') return normalizePath(app.readingMediaRootDirectory);
  if (moduleKey === 'music') return normalizePath(app.musicMediaRootDirectory);
  if (moduleKey === 'video') return normalizePath(app.videoMediaRootDirectory);
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

/** 模块下载/导出统一目录：MediaRoot/<Module>/Download */
export async function resolveModuleDownloadDirectory(moduleKey: MediaModuleKey): Promise<string> {
  const moduleRoot = await resolveModuleMediaRoot(moduleKey);
  const downloadDir = await joinPath(moduleRoot, 'Download');
  await ensureDirectory(downloadDir);
  return downloadDir;
}

export async function ensureDirectory(path: string): Promise<void> {
  if (!isTauri()) return;
  const { mkdir } = await import('@tauri-apps/plugin-fs');
  await mkdir(path, { recursive: true });
}
