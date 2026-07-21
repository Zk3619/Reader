import { isTauri } from '@/lib/platform/detect';
import {
  resolveModuleDownloadDirectory,
  type MediaModuleKey,
} from '@/lib/media/media-root';
import { settingsStore } from '@/stores/settings';

function shouldRememberExportDirectory(): boolean {
  return settingsStore.state.app.rememberLastExportDirectory === true;
}

function shouldSilentExport(): boolean {
  return settingsStore.state.app.silentExportToModuleDirectory === true;
}

function getRememberedExportDirectory(): string {
  return settingsStore.state.app.lastExportDirectory?.trim() ?? '';
}

export async function resolveExportDialogDefaultPath(defaultFileName: string): Promise<string> {
  if (!isTauri()) return defaultFileName;
  if (!shouldRememberExportDirectory()) return defaultFileName;
  const exportDir = getRememberedExportDirectory();
  if (!exportDir) return defaultFileName;
  try {
    const { join } = await import('@tauri-apps/api/path');
    return await join(exportDir, defaultFileName);
  } catch {
    return defaultFileName;
  }
}

async function buildNonConflictFilePath(baseDir: string, fileName: string): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  const { exists } = await import('@tauri-apps/plugin-fs');
  const dotIndex = fileName.lastIndexOf('.');
  const hasExt = dotIndex > 0 && dotIndex < fileName.length - 1;
  const base = hasExt ? fileName.slice(0, dotIndex) : fileName;
  const ext = hasExt ? fileName.slice(dotIndex) : '';

  let candidate = await join(baseDir, fileName);
  if (!(await exists(candidate))) return candidate;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  candidate = await join(baseDir, `${base}_${stamp}${ext}`);
  if (!(await exists(candidate))) return candidate;

  for (let i = 1; i <= 999; i++) {
    const next = await join(baseDir, `${base}_${stamp}_${i}${ext}`);
    if (!(await exists(next))) return next;
  }
  return candidate;
}

export async function resolveSilentExportFilePath(
  moduleKey: MediaModuleKey,
  fileName: string,
): Promise<string | null> {
  if (!isTauri() || !shouldSilentExport()) return null;
  const downloadDir = await resolveModuleDownloadDirectory(moduleKey);
  return buildNonConflictFilePath(downloadDir, fileName);
}

export async function resolveSilentExportDirectory(
  moduleKey: MediaModuleKey,
): Promise<string | null> {
  if (!isTauri() || !shouldSilentExport()) return null;
  return resolveModuleDownloadDirectory(moduleKey);
}

export async function rememberExportFilePath(filePath: string): Promise<void> {
  if (!isTauri() || !shouldRememberExportDirectory()) return;
  const nextFilePath = filePath.trim();
  if (!nextFilePath) return;
  try {
    const { dirname } = await import('@tauri-apps/api/path');
    const exportDir = (await dirname(nextFilePath)).trim();
    if (!exportDir) return;
    if (settingsStore.state.app.lastExportDirectory?.trim() === exportDir) return;
    await settingsStore.updateAppSettings({ lastExportDirectory: exportDir });
  } catch {
    /* ignore */
  }
}

export async function rememberExportDirectory(directory: string): Promise<void> {
  if (!isTauri() || !shouldRememberExportDirectory()) return;
  const nextDir = directory.trim();
  if (!nextDir) return;
  if (settingsStore.state.app.lastExportDirectory?.trim() === nextDir) return;
  try {
    await settingsStore.updateAppSettings({ lastExportDirectory: nextDir });
  } catch {
    /* ignore */
  }
}
