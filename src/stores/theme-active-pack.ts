/**
 * 内存中的「当前应用/阅读器主题 pack」快照 — 应用后立即刷新全局层
 */

import { createSignal } from 'solid-js';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

const [activeThemePackSnapshot, setActiveThemePackSnapshot] = createSignal<ReaderThemePackV1 | null>(
  null,
);
const [activeThemePackRevision, setActiveThemePackRevision] = createSignal(0);

const [activeViewerThemePackSnapshot, setActiveViewerThemePackSnapshot] =
  createSignal<ReaderThemePackV1 | null>(null);
const [activeViewerThemePackRevision, setActiveViewerThemePackRevision] = createSignal(0);

export function publishActiveThemePack(pack: ReaderThemePackV1 | null): void {
  setActiveThemePackSnapshot(pack);
  setActiveThemePackRevision((n) => n + 1);
}

export function getActiveThemePackSnapshot(): ReaderThemePackV1 | null {
  return activeThemePackSnapshot();
}

export function useActiveThemePackRevision(): number {
  return activeThemePackRevision();
}

export function publishActiveViewerThemePack(pack: ReaderThemePackV1 | null): void {
  setActiveViewerThemePackSnapshot(pack);
  setActiveViewerThemePackRevision((n) => n + 1);
}

export function getActiveViewerThemePackSnapshot(): ReaderThemePackV1 | null {
  return activeViewerThemePackSnapshot();
}

export function useActiveViewerThemePackRevision(): number {
  return activeViewerThemePackRevision();
}
