import { resolveThemeIndex } from '@/lib/reader-theme-config';

const NIGHT_CLASS = 'reader-night';

export function applyShellThemeFromReadConfig(config: {
  theme?: number;
  themeName?: string;
}): void {
  const isNight = resolveThemeIndex(config) === 6;
  document.documentElement.classList.toggle(NIGHT_CLASS, isNight);
}

export function clearShellTheme(): void {
  document.documentElement.classList.remove(NIGHT_CLASS);
}
