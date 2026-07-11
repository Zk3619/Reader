/**
 * 主题工作室 — 导出质量门禁展示
 */

import { For, Show, createMemo } from 'solid-js';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  runThemePackQualityGate,
  type ThemeQualityIssue,
  type ThemeQualitySeverity,
} from '@/lib/theme/quality/theme-pack-quality-gate';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

export interface ThemeStudioQualityPanelProps {
  pack: ReaderThemePackV1;
  assetSizeBytes?: number;
  hasPreviewPng?: boolean;
  class?: string;
}

function severityVariant(severity: ThemeQualitySeverity): 'success' | 'secondary' | 'error' | 'warning' {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function severityLabel(severity: ThemeQualitySeverity): string {
  switch (severity) {
    case 'error':
      return '错误';
    case 'warning':
      return '警告';
    case 'info':
      return '提示';
    default:
      return severity;
  }
}

export function ThemeStudioQualityPanel(props: ThemeStudioQualityPanelProps) {
  const result = createMemo(() =>
    runThemePackQualityGate(props.pack, {
      assetSizeBytes: props.assetSizeBytes,
      hasPreviewPng: props.hasPreviewPng,
    }),
  );

  const errors = () => result().issues.filter((i) => i.severity === 'error');
  const warnings = () => result().issues.filter((i) => i.severity === 'warning');
  const infos = () => result().issues.filter((i) => i.severity === 'info');

  const renderGroup = (title: string, items: ThemeQualityIssue[]) => (
    <Show when={items.length > 0}>
      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">{title}</p>
        <For each={items}>
          {(issue) => (
            <div class="flex items-start gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
              <Badge variant={severityVariant(issue.severity)} class="shrink-0 text-[10px]">
                {severityLabel(issue.severity)}
              </Badge>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-foreground">{issue.message}</p>
                <p class="truncate text-[10px] text-muted-foreground">{issue.path}</p>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );

  return (
    <div class={cn('space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3', props.class)}>
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-medium text-foreground">导出质量门禁</p>
        <Badge variant={result().ok ? 'success' : 'error'}>
          {result().ok ? '通过' : '未通过'}
        </Badge>
      </div>
      <Show
        when={result().issues.length > 0}
        fallback={<p class="text-xs text-muted-foreground">未发现质量问题</p>}
      >
        {renderGroup('错误', errors())}
        {renderGroup('警告', warnings())}
        {renderGroup('提示', infos())}
      </Show>
    </div>
  );
}
