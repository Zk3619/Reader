/**
 * Hub 分组徽标堆叠：轨 / 芯片样式（对齐探索页堆叠，并保留紧凑风格可切换）
 */

import { cn } from '@/lib/utils';

/** 标准：探索页同款；紧凑：原音乐/影视矮芯片 */
export type HubTagStackChipDensity = 'comfortable' | 'compact';

/**
 * PageToolbar 已有 `px-4`；堆叠轨用负边距对齐探索页 / 列表的 `px-2`，
 * 避免 below 再叠 `px-4` 造成左右加倍。Tab 行勿用此项。
 */
export const hubTagStackBelowInsetClass = '-mx-2';

/** below 区外框（无水平 padding；水平由 Toolbar / 堆叠负边距处理） */
export const hubTagStackBelowFrameClass = 'space-y-1 pb-2';

/** 单轨徽标（自带限高滚动，如在线歌单） */
export const hubTagStackTrackClass =
  'flex max-h-32 flex-wrap items-center gap-1 overflow-y-auto scroll-gutter-stable-both overscroll-contain p-1';

/** 外层已限高时的单轨（如影视 below 总视口内） */
export const hubTagStackTrackBareClass = 'flex flex-wrap items-center gap-1 p-1';

/** 下拉面板内嵌徽标轨 */
export const hubTagStackTrackInMenuClass =
  'flex max-h-32 flex-wrap items-center gap-1 overflow-y-auto scroll-gutter-stable-both overscroll-contain p-1';

const CHIP_BASE_COMFORTABLE =
  'h-9 max-w-48 shrink-0 justify-center rounded-lg border px-3 text-sm font-medium shadow-sm';

const CHIP_BASE_COMPACT =
  'h-auto max-w-48 shrink-0 justify-center rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm';

/** 徽标堆叠芯片；`keepHoverFg` 时选中悬停不切到 accent 文字色（outline Button） */
export function hubTagStackChipClass(
  selected: boolean,
  density: HubTagStackChipDensity,
  opts?: { keepHoverFg?: boolean },
): string {
  return cn(
    density === 'comfortable' ? CHIP_BASE_COMFORTABLE : CHIP_BASE_COMPACT,
    selected
      ? opts?.keepHoverFg
        ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/30 hover:bg-primary/10 hover:text-foreground'
        : 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/30'
      : 'border-border/60 bg-background/80 hover:bg-accent hover:text-accent-foreground',
  );
}

export function isHubTagStackChipDensity(v: unknown): v is HubTagStackChipDensity {
  return v === 'comfortable' || v === 'compact';
}
