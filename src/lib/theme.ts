/**
 * 应用主题运行时（兼容 `@/lib/theme` 路径）
 * @see src/lib/theme/runtime.ts
 */
export {
  applyBootstrapThemeFromLocalStorage,
  applyThemeToDocument,
  clampThemeHour,
  getEffectiveDark,
  getEffectiveDarkFromSnapshot,
  isScheduleDaylight,
  normalizeThemeMode,
  normalizeThemeScheduleHours,
  readThemeScheduleHours,
  syncThemeBootstrapSnapshotFromAppSettings,
  writeThemeBootstrapSnapshot,
  type ThemeBootstrapSnapshot,
  type ThemeMode,
  type ThemeScheduleHours,
} from '@/lib/theme/runtime';

export type { AppThemeMode } from '@/lib/theme/types';
