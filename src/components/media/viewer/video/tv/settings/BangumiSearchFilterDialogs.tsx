/**
 * 番剧搜索筛选：更多菜单各项 → AppDialog（对齐 Kazumi 搜索工作台分类）
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  BANGUMI_SEARCH_PRESET_TAGS,
  BANGUMI_SEARCH_SORT_OPTIONS,
  buildSeasonOptions,
  type BangumiSearchFilterState,
  type BangumiSearchSort,
} from '@/lib/media/video/bangumi/meta/search-filter';
import { BANGUMI_WEEKDAYS } from '@/lib/media/video/bangumi/meta/tags';
import {
  appDialogSettingsScrollTrack,
  appDialogSettingsShell,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

type DialogBase = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: () => BangumiSearchFilterState;
  onApply: (patch: Partial<BangumiSearchFilterState>) => void;
};

export function BangumiSearchSortDialog(props: DialogBase) {
  const [sort, setSort] = createSignal<BangumiSearchSort>(props.filter().sort);
  createEffect(() => {
    if (props.open) setSort(props.filter().sort);
  });
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>排序</AppDialogTitle>
          <AppDialogDescription>对齐 Bangumi 搜索 sort 参数</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="flex flex-col gap-2 p-1">
            <For each={BANGUMI_SEARCH_SORT_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                    sort() === opt.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/60 hover:bg-accent/40',
                  )}
                  onClick={() => setSort(opt.value)}
                >
                  <span class="font-medium">{opt.label}</span>
                  <span class="text-xs text-muted-foreground">{opt.hint}</span>
                </button>
              )}
            </For>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              props.onApply({ sort: sort() });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function BangumiSearchTagsDialog(props: DialogBase) {
  const [tags, setTags] = createSignal<string[]>([]);
  const [custom, setCustom] = createSignal('');
  createEffect(() => {
    if (props.open) {
      setTags(props.filter().tags.slice());
      setCustom('');
    }
  });
  function toggle(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>标签</AppDialogTitle>
          <AppDialogDescription>多选标签将作为 AND 条件传给 Bangumi</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="space-y-3 p-1">
            <div class="flex flex-wrap gap-1.5">
              <For each={[...BANGUMI_SEARCH_PRESET_TAGS]}>
                {(t) => (
                  <button
                    type="button"
                    class={cn(
                      'rounded-lg border px-2.5 py-1 text-xs',
                      tags().includes(t)
                        ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border/60 hover:bg-accent/40',
                    )}
                    onClick={() => toggle(t)}
                  >
                    {t}
                  </button>
                )}
              </For>
            </div>
            <div class="flex gap-2">
              <AppTextField class="flex-1">
                <AppTextFieldInput
                  placeholder="自定义标签"
                  value={custom()}
                  onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                    setCustom(e.currentTarget.value)
                  }
                />
              </AppTextField>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const t = custom().trim();
                  if (!t) return;
                  if (!tags().includes(t)) setTags((p) => [...p, t]);
                  setCustom('');
                }}
              >
                添加
              </Button>
            </div>
            <Show when={tags().length}>
              <div class="flex flex-wrap gap-1">
                <For each={tags()}>
                  {(t) => (
                    <button
                      type="button"
                      class="rounded-full border border-border/60 px-2 py-0.5 text-[11px] hover:bg-destructive/10"
                      onClick={() => toggle(t)}
                    >
                      {t} ×
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setTags([])}>
            清空
          </Button>
          <Button
            onClick={() => {
              props.onApply({ tags: tags() });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function BangumiSearchSeasonDialog(props: DialogBase) {
  const seasons = buildSeasonOptions(20);
  const [season, setSeason] = createSignal('');
  const [start, setStart] = createSignal('');
  const [end, setEnd] = createSignal('');
  createEffect(() => {
    if (!props.open) return;
    const f = props.filter();
    setSeason(f.season);
    setStart(f.dateRange?.start ?? '');
    setEnd(f.dateRange?.end ?? '');
  });
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>季度与日期</AppDialogTitle>
          <AppDialogDescription>
            选择季度或自定义放送日期区间（结束日为开区间）
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="space-y-4 p-1">
            <div class="space-y-2">
              <Label class="text-xs">季度</Label>
              <AppSelect
                value={season() || null}
                onChange={(v) => {
                  setSeason(v ?? '');
                  if (v) {
                    setStart('');
                    setEnd('');
                  }
                }}
                options={['', ...seasons.map((s) => s.value)]}
                itemComponent={(p) => {
                  const v = String(p.item.rawValue || '');
                  const label = v ? seasons.find((s) => s.value === v)?.label || v : '不限季度';
                  return <AppSelectItem item={p.item}>{label}</AppSelectItem>;
                }}
              >
                <AppSelectTrigger layout="form" class="h-9" aria-label="季度">
                  <AppSelectValue>
                    {() => {
                      const v = season();
                      return v ? seasons.find((s) => s.value === v)?.label || v : '不限季度';
                    }}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <Label class="text-xs">开始日期</Label>
                <AppTextField>
                  <AppTextFieldInput
                    type="date"
                    value={start()}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
                      setStart(e.currentTarget.value);
                      if (e.currentTarget.value) setSeason('');
                    }}
                  />
                </AppTextField>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">结束日期</Label>
                <AppTextField>
                  <AppTextFieldInput
                    type="date"
                    value={end()}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) => {
                      setEnd(e.currentTarget.value);
                      if (e.currentTarget.value) setSeason('');
                    }}
                  />
                </AppTextField>
              </div>
            </div>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSeason('');
              setStart('');
              setEnd('');
            }}
          >
            不限日期
          </Button>
          <Button
            onClick={() => {
              const s = start().trim();
              const e = end().trim();
              props.onApply({
                season: season(),
                dateRange: s && e ? { start: s, end: e } : null,
              });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function BangumiSearchRangeDialog(props: DialogBase) {
  const [scoreOn, setScoreOn] = createSignal(false);
  const [rankOn, setRankOn] = createSignal(false);
  const [scoreMin, setScoreMin] = createSignal(7);
  const [scoreMax, setScoreMax] = createSignal(10);
  const [rankMin, setRankMin] = createSignal(1);
  const [rankMax, setRankMax] = createSignal(5000);
  createEffect(() => {
    if (!props.open) return;
    const f = props.filter();
    const sc = f.scoreRange;
    const rk = f.rankRange;
    setScoreOn(!!(sc && (sc.min != null || sc.max != null)));
    setRankOn(!!(rk && (rk.min != null || rk.max != null)));
    setScoreMin(sc?.min ?? 7);
    setScoreMax(sc?.max ?? 10);
    setRankMin(rk?.min ?? 1);
    setRankMax(rk?.max ?? 5000);
  });
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>数值范围</AppDialogTitle>
          <AppDialogDescription>评分与排名区间（对齐 Kazumi 搜索工作台）</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="space-y-4 p-1">
            <div class="flex items-center justify-between gap-3">
              <Label class="text-sm">启用评分范围</Label>
              <AppSwitch checked={scoreOn()} onChange={setScoreOn}>
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <Show when={scoreOn()}>
              <div class="grid grid-cols-2 gap-2">
                <AppTextField>
                  <AppTextFieldInput
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={String(scoreMin())}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                      setScoreMin(Number(e.currentTarget.value) || 0)
                    }
                  />
                </AppTextField>
                <AppTextField>
                  <AppTextFieldInput
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={String(scoreMax())}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                      setScoreMax(Number(e.currentTarget.value) || 0)
                    }
                  />
                </AppTextField>
              </div>
            </Show>
            <div class="flex items-center justify-between gap-3">
              <Label class="text-sm">启用排名范围</Label>
              <AppSwitch checked={rankOn()} onChange={setRankOn}>
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <Show when={rankOn()}>
              <div class="grid grid-cols-2 gap-2">
                <AppTextField>
                  <AppTextFieldInput
                    type="number"
                    min={1}
                    max={10000}
                    value={String(rankMin())}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                      setRankMin(Number(e.currentTarget.value) || 1)
                    }
                  />
                </AppTextField>
                <AppTextField>
                  <AppTextFieldInput
                    type="number"
                    min={1}
                    max={10000}
                    value={String(rankMax())}
                    onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
                      setRankMax(Number(e.currentTarget.value) || 1)
                    }
                  />
                </AppTextField>
              </div>
            </Show>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              props.onApply({
                scoreRange: scoreOn() ? { min: scoreMin(), max: scoreMax() } : null,
                rankRange: rankOn() ? { min: rankMin(), max: rankMax() } : null,
              });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function BangumiSearchWeekdayDialog(props: DialogBase) {
  const [days, setDays] = createSignal<number[]>([]);
  createEffect(() => {
    if (props.open) setDays(props.filter().weekdays.slice());
  });
  function toggle(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>星期</AppDialogTitle>
          <AppDialogDescription>按放送星期筛选（可多选）</AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="flex flex-wrap gap-2 p-1">
            <For each={[...BANGUMI_WEEKDAYS]}>
              {(w) => (
                <button
                  type="button"
                  class={cn(
                    'h-9 min-w-10 rounded-md border px-3 text-sm',
                    days().includes(w.weekday)
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/60 hover:bg-accent/40',
                  )}
                  onClick={() => toggle(w.weekday)}
                >
                  周{w.label}
                </button>
              )}
            </For>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => setDays([])}>
            清空
          </Button>
          <Button
            onClick={() => {
              props.onApply({ weekdays: days() });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export function BangumiSearchClientFilterDialog(props: DialogBase) {
  const [hideWatched, setHideWatched] = createSignal(false);
  const [hideAbandoned, setHideAbandoned] = createSignal(false);
  createEffect(() => {
    if (!props.open) return;
    const f = props.filter();
    setHideWatched(f.hideWatched);
    setHideAbandoned(f.hideAbandoned);
  });
  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>过滤</AppDialogTitle>
          <AppDialogDescription>
            客户端过滤（对齐 Kazumi 隐藏已看 / 已弃番）
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <div class="space-y-3 p-1">
            <div class="flex items-center justify-between gap-3">
              <div>
                <Label class="text-sm">隐藏已看</Label>
                <p class="text-[11px] text-muted-foreground">需收藏分型；当前版本暂无效果</p>
              </div>
              <AppSwitch checked={hideWatched()} onChange={setHideWatched}>
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <div class="flex items-center justify-between gap-3">
              <div>
                <Label class="text-sm">隐藏已弃</Label>
                <p class="text-[11px] text-muted-foreground">需收藏分型；当前版本暂无效果</p>
              </div>
              <AppSwitch checked={hideAbandoned()} onChange={setHideAbandoned}>
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button
            onClick={() => {
              props.onApply({ hideWatched: hideWatched(), hideAbandoned: hideAbandoned() });
              props.onOpenChange(false);
            }}
          >
            应用
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
