/**
 * WebView 数据目录与清理（桌面 Tauri）
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';

export async function getWebviewDataRoot(): Promise<string> {
  return invoke<string>('get_webview_data_root');
}

export async function getLogDirectory(): Promise<string> {
  return invoke<string>('get_log_directory');
}

export async function getWebviewStorageStats(): Promise<number> {
  return invoke<number>('get_webview_storage_stats');
}

export async function clearWebviewDiskCache(): Promise<number> {
  return invoke<number>('clear_webview_disk_cache');
}

export async function clearWebviewCookies(): Promise<number> {
  return invoke<number>('clear_webview_cookies');
}

export async function clearMainWebviewAllBrowsingData(): Promise<void> {
  await invoke('clear_main_webview_all_browsing_data');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isDesktopTauri(): boolean {
  if (!isTauri()) return false;
  const p = import.meta.env.TAURI_ENV_PLATFORM;
  return p !== 'android' && p !== 'ios';
}
