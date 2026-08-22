/**
 * 创建下载任务时选择目标质量（视频 / 音频 / 图片）— AppDialog
 */

import { For, Show, createMemo, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
import {
  listAvailableQualityGroups,
  type DownloadQualityPreset,
} from '@/lib/download/download-quality';
import type { Format } from '@/lib/download/ytdlp/types';

const qualityOptionClass =
  'h-auto min-h-10 w-full justify-start rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40';

export interface DownloadQualityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 解析得到的 formats；为空时展示常用档位 */
  formats?: Format[] | Array<Record<string, unknown>>;
  /** 视频/资源标题，显示在正文区，勿塞进 Header Description */
  title?: string;
  busy?: boolean;
  onConfirm: (preset: DownloadQualityPreset) => void;
}

export const DownloadQualityDialog: Component<DownloadQualityDialogProps> = (props) => {
  const groups = createMemo(() =>
    listAvailableQualityGroups((props.formats as Format[]) ?? []),
  );

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="sm:max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>选择下载质量</AppDialogTitle>
          <AppDialogDescription>
            按媒体类型选择画质、音质或图片尺寸；若片源不支持将自动降级。
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody class={appDialogScrollBodySpaceY3}>
          <Show when={props.title?.trim()}>
            {(name) => (
              <p class="truncate text-sm text-muted-foreground" title={name()}>
                {name()}
              </p>
            )}
          </Show>

          <Show
            when={groups().length > 0}
            fallback={<p class="py-4 text-center text-sm text-muted-foreground">暂无可用质量选项</p>}
          >
            <div class="flex flex-col gap-4">
              <For each={groups()}>
                {(group) => (
                  <section class="flex flex-col gap-2">
                    <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                    <div class="flex flex-col gap-2">
                      <For each={group.options}>
                        {(item) => (
                          <Button
                            variant="ghost"
                            class={qualityOptionClass}
                            disabled={props.busy}
                            onClick={() => {
                              props.onOpenChange(false);
                              props.onConfirm(item.id);
                            }}
                          >
                            <span class="flex w-full flex-col items-start gap-0.5">
                              <span class="text-sm font-medium">{item.label}</span>
                              <Show when={item.description}>
                                {(desc) => (
                                  <span class="text-xs font-normal text-muted-foreground">
                                    {desc()}
                                  </span>
                                )}
                              </Show>
                            </span>
                          </Button>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Show>
        </AppDialogScrollBody>

        <AppDialogFooter>
          <Button variant="outline" disabled={props.busy} onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
};
