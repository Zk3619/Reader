/**
 * 主题预设变更通知 — 设置页 / 工作室列表同步
 */

type ThemePresetChangeListener = () => void;

const listeners = new Set<ThemePresetChangeListener>();

export function onThemePresetsChanged(listener: ThemePresetChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitThemePresetsChanged(): void {
  listeners.forEach((listener) => listener());
}
