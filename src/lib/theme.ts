/**
 * 应用主题：根据设置应用到 document，并支持「跟随系统」。
 * 持久化由 settingsStore 负责，此处只做应用与系统偏好监听。
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

let mediaQuery: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;

function getPreferredDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 当前主题对应的实际是否为深色（auto 时取系统偏好） */
export function getEffectiveDark(theme: ThemeMode): boolean {
  if (theme === 'light') return false;
  if (theme === 'dark') return true;
  return getPreferredDark();
}

/** 将主题应用到 document.documentElement（classList dark） */
export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const dark = getEffectiveDark(theme);
  document.documentElement.classList.toggle('dark', dark);

  // 清理之前的系统偏好监听
  if (mediaListener && mediaQuery) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaListener = null;
    mediaQuery = null;
  }

  if (theme === 'auto') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = () => {
      document.documentElement.classList.toggle('dark', getPreferredDark());
    };
    mediaQuery.addEventListener('change', mediaListener);
  }
}
