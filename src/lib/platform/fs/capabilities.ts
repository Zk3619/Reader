import { isTauri } from '@/lib/platform/detect';

export type FsPlatform = 'desktop' | 'android' | 'ios' | 'web';

export type FsLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export function resolveFsPlatform(): FsPlatform {
  const env = import.meta.env.TAURI_ENV_PLATFORM;
  if (env === 'windows' || env === 'linux' || env === 'macos') return 'desktop';
  if (env === 'android') return 'android';
  if (env === 'ios') return 'ios';
  if (isTauri()) {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('android')) return 'android';
      if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    }
    return 'desktop';
  }
  return 'web';
}

export function isDesktopTauri(): boolean {
  return isTauri() && resolveFsPlatform() === 'desktop';
}

export function supportsTauriDialogFilePicker(): boolean {
  return isTauri();
}

export function supportsTauriDialogDirectoryPicker(): boolean {
  return isDesktopTauri();
}

export function supportsFsAccessOpenFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export function supportsFsAccessDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function supportsLegacyFileInput(): boolean {
  return typeof document !== 'undefined';
}

export function supportsLegacyDirectoryInput(): boolean {
  return typeof document !== 'undefined';
}

/** L3：仅 Android Tauri 可能可用 */
export function mayUseAndroidFsLayer(): boolean {
  return isTauri() && resolveFsPlatform() === 'android';
}

let androidFsPluginProbed: boolean | null = null;

export async function supportsAndroidFsPlugin(): Promise<boolean> {
  if (!mayUseAndroidFsLayer()) return false;
  if (androidFsPluginProbed !== null) return androidFsPluginProbed;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<boolean>('android_fs_probe');
    androidFsPluginProbed = true;
    return true;
  } catch {
    androidFsPluginProbed = false;
    return false;
  }
}
