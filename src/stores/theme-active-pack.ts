/**
 * 内存中的「当前应用/阅读器主题 pack」快照 — 应用后立即刷新全局层
 */

import { createSignal } from 'solid-js';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import type { ThemeTargetId } from '@/lib/theme/theme-targets';

const [activeThemePackSnapshot, setActiveThemePackSnapshot] = createSignal<ReaderThemePackV1 | null>(
  null,
);
const [activeThemePackRevision, setActiveThemePackRevision] = createSignal(0);

const [activeViewerThemePackSnapshot, setActiveViewerThemePackSnapshot] =
  createSignal<ReaderThemePackV1 | null>(null);
const [activeViewerThemePackRevision, setActiveViewerThemePackRevision] = createSignal(0);
const [activeThemeTargetRevision, setActiveThemeTargetRevision] = createSignal(0);
const targetThemePackSnapshots = new Map<ThemeTargetId, ReaderThemePackV1>();

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

/** 任意模块/子目标活动预设变化时通知运行时重新解析。 */
export function publishActiveThemeTargetChange(): void {
  setActiveThemeTargetRevision((n) => n + 1);
}

export function useActiveThemeTargetRevision(): number {
  return activeThemeTargetRevision();
}

export function publishActiveThemeTargetPack(
  target: ThemeTargetId,
  pack: ReaderThemePackV1 | null,
): void {
  if (pack) targetThemePackSnapshots.set(target, pack);
  else targetThemePackSnapshots.delete(target);
  publishActiveThemeTargetChange();
}

export function getActiveThemeTargetPackSnapshot(
  target: ThemeTargetId,
): ReaderThemePackV1 | null {
  return targetThemePackSnapshots.get(target) ?? null;
}
