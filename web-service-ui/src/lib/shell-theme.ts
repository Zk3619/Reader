/** Web 服务 Shell 外观：明 / 暗 / 跟随系统 */

export type ShellThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'reader-web-shell-theme';
const THEME_ATTR = 'data-theme';

export function getShellThemeMode(): ShellThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function setShellThemeMode(mode: ShellThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function applyShellTheme(mode: ShellThemeMode): void {
  document.documentElement.setAttribute(THEME_ATTR, mode);
}

let systemListener: (() => void) | null = null;

/** 应用已保存偏好并监听系统主题变化（跟随模式） */
export function initShellTheme(): void {
  applyShellTheme(getShellThemeMode());

  systemListener?.();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getShellThemeMode() === 'system') {
      applyShellTheme('system');
    }
  };
  mq.addEventListener('change', onChange);
  systemListener = () => mq.removeEventListener('change', onChange);
}

export function selectShellTheme(mode: ShellThemeMode): void {
  setShellThemeMode(mode);
  applyShellTheme(mode);
}
