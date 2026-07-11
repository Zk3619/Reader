/**
 * 主题工作室 — 高级模式性能预算徽章
 */

import { Show, createMemo } from 'solid-js';
import { Badge } from '@/components/ui/badge';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { cn } from '@/lib/utils';
import {
  evaluateThemePackPerformanceBudget,
  type PerformanceBudgetLevel,
} from '@/lib/theme/quality/theme-pack-performance-budget';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

export interface ThemeStudioPerformanceBadgeProps {
  pack: ReaderThemePackV1;
  assetSizeBytes?: number;
  class?: string;
}

const LEVEL_LABEL: Record<PerformanceBudgetLevel, string> = {
  green: '性能良好',
  yellow: '性能一般',
  red: '性能吃紧',
};

const LEVEL_CLASS: Record<PerformanceBudgetLevel, string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  yellow: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function ThemeStudioPerformanceBadge(props: ThemeStudioPerformanceBadgeProps) {
  const budget = createMemo(() =>
    evaluateThemePackPerformanceBudget(props.pack, {
      assetSizeBytes: props.assetSizeBytes,
    }),
  );

  const tooltipBody = () => {
    const b = budget();
    const lines = [
      `评分 ${b.score}/100`,
      `特效 ${b.metrics.enabledEffects} · 模糊层 ${b.metrics.blurLayers}`,
      b.metrics.tsParticlesEnabled ? 'tsParticles 已启用' : null,
      ...b.warnings,
    ].filter(Boolean);
    return lines.join('\n');
  };

  return (
    <AppTooltip>
      <AppTooltipTrigger
        as="div"
        class={cn(
          'inline-flex cursor-default items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
          LEVEL_CLASS[budget().level],
          props.class,
        )}
      >
        <span>性能 {budget().score}</span>
        <Badge variant="secondary" class="h-5 px-1.5 text-[10px]">
          {LEVEL_LABEL[budget().level]}
        </Badge>
      </AppTooltipTrigger>
      <AppTooltipContent class="max-w-xs whitespace-pre-line text-xs">
        {tooltipBody()}
        <Show when={budget().warnings.length === 0}>
          <span class="text-muted-foreground">当前主题负载较低</span>
        </Show>
      </AppTooltipContent>
    </AppTooltip>
  );
}
