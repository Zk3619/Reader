/**
 * 主题工作室 — A/B 对比预览包装器
 */

import { Show, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { themeStudioStore } from '@/stores/theme-studio';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { ThemePreviewSandbox } from '@/components/theme/ThemePreviewSandbox';
import type { ThemePreviewSandboxProps } from '@/components/theme/ThemePreviewSandbox';

export interface ThemeStudioABCompareProps extends ThemePreviewSandboxProps {
  children?: JSX.Element;
}

export function ThemeStudioABCompare(props: ThemeStudioABCompareProps) {
  const abEnabled = () => themeStudioStore.state.abCompareEnabled;
  const snapshot = () => themeStudioStore.state.abSnapshotPack;

  const sandboxProps = (): ThemePreviewSandboxProps => ({
    pack: props.pack,
    scope: props.scope,
    previewMode: props.previewMode,
    selectedComponentId: props.selectedComponentId,
    colorMode: props.colorMode,
    viewport: props.viewport,
    packRevision: props.packRevision,
    class: props.class,
  });

  const snapshotRevision = () => 0;

  return (
    <div class="relative flex min-h-0 flex-1 flex-col">
      <Show
        when={abEnabled() && snapshot()}
        fallback={props.children ?? <ThemePreviewSandbox {...sandboxProps()} />}
      >
        {(snap) => (
          <div class="flex min-h-0 flex-1 flex-col gap-2">
            <div class="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-xs text-muted-foreground">A/B 对比：左侧为快照 A，右侧为当前草稿 B</p>
              <div class="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  class="cursor-pointer"
                  onClick={() => themeStudioStore.adoptAbSnapshot('a')}
                >
                  保留 A
                </Button>
                <Button
                  size="sm"
                  class="cursor-pointer"
                  onClick={() => themeStudioStore.adoptAbSnapshot('b')}
                >
                  保留 B
                </Button>
              </div>
            </div>
            <div class="grid min-h-0 flex-1 grid-cols-2 gap-2">
              <div class="flex min-h-0 min-w-0 flex-col">
                <p class="mb-1 shrink-0 text-center text-xs font-medium text-muted-foreground">A · 快照</p>
                <ThemePreviewSandbox
                  {...sandboxProps()}
                  pack={snap() as ReaderThemePackV1}
                  packRevision={snapshotRevision}
                  class={cn('min-h-0 flex-1', props.class)}
                />
              </div>
              <div class="flex min-h-0 min-w-0 flex-col">
                <p class="mb-1 shrink-0 text-center text-xs font-medium text-muted-foreground">B · 当前</p>
                <ThemePreviewSandbox {...sandboxProps()} class={cn('min-h-0 flex-1', props.class)} />
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
