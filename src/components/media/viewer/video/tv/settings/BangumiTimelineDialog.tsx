/**
 * 番剧放送时间表配置（对齐 Kazumi Timeline 排序 / 过滤器）
 */

import { For, Show } from 'solid-js';
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
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Label } from '@/components/ui/label';
import {
  getBangumiModulePrefs,
  setBangumiModulePrefs,
  type BangumiTimelineSort,
} from '@/lib/media/video/bangumi/prefs';
import {
  appDialogSettingsScrollTrack,
  appDialogSettingsShell,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

const SORT_OPTIONS: { value: BangumiTimelineSort; label: string; hint: string }[] = [
  { value: 'heat', label: '热度优先', hint: '按评分人数' },
  { value: 'score', label: '评分优先', hint: '按评分高低' },
  { value: 'id', label: '时间优先', hint: '按条目 ID' },
];

export function BangumiTimelineDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  const prefs = () => getBangumiModulePrefs();

  function patch(partial: Parameters<typeof setBangumiModulePrefs>[0]) {
    setBangumiModulePrefs(partial);
    props.onApplied?.();
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>时间表配置</AppDialogTitle>
          <AppDialogDescription>
            对齐 Kazumi 时间线：排序方式与过滤器（「在看」对应本应用已追番收藏）
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody
          frameClass={dialogScrollFrameFlex}
          class={appDialogSettingsScrollTrack}
        >
          <div class="space-y-4 p-1">
            <section class="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <h3 class="text-sm font-semibold">排序方式</h3>
              <div class="flex flex-col gap-2">
                <For each={SORT_OPTIONS}>
                  {(opt) => (
                    <button
                      type="button"
                      class={cn(
                        'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        prefs().timelineSort === opt.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/60 hover:bg-accent/40',
                      )}
                      onClick={() => patch({ timelineSort: opt.value })}
                    >
                      <span class="font-medium">{opt.label}</span>
                      <span class="text-xs text-muted-foreground">{opt.hint}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>

            <section class="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <h3 class="text-sm font-semibold">过滤器</h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <Label class="text-sm">隐藏弃番</Label>
                    <p class="text-[11px] text-muted-foreground">
                      需收藏分型支持；当前版本暂无弃番标记
                    </p>
                  </div>
                  <AppSwitch
                    checked={prefs().timelineHideAbandoned}
                    onChange={(c) => patch({ timelineHideAbandoned: c })}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <Label class="text-sm">隐藏看过</Label>
                    <p class="text-[11px] text-muted-foreground">
                      需收藏分型支持；当前版本暂无「看过」标记
                    </p>
                  </div>
                  <AppSwitch
                    checked={prefs().timelineHideWatched}
                    onChange={(c) => patch({ timelineHideWatched: c })}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <Label class="text-sm">仅显示在看</Label>
                    <p class="text-[11px] text-muted-foreground">仅显示已加入追番收藏的条目</p>
                  </div>
                  <AppSwitch
                    checked={prefs().timelineOnlyWatching}
                    onChange={(c) => patch({ timelineOnlyWatching: c })}
                  >
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                  </AppSwitch>
                </div>
              </div>
              <Show when={prefs().timelineHideAbandoned || prefs().timelineHideWatched}>
                <p class="text-[11px] text-amber-600 dark:text-amber-400">
                  弃番 / 看过过滤将在支持收藏分型后生效。
                </p>
              </Show>
            </section>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            完成
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
