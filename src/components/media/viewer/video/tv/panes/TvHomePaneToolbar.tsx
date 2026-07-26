/**
 * 影视首页操作区：站点 / 分类 / 筛选（下拉或徽标堆叠，可切换）
 */

import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppTabs } from '@/components/shared/AppTabs';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import {
  ChevronDownIcon,
  LayoutIcon,
  MoreIcon,
  RefreshIcon,
} from '@/components/shared/icons';
import {
  getTvHomeUi,
  setTvHomeClassControl,
  setTvHomeFilterControl,
  setTvHomePaginationPreference,
  setTvHomeSiteControl,
  setTvHomeTagStackDensity,
} from '@/stores/tv-hub/tv-home-ui';
import {
  getTvHomeState,
  loadCategory,
  loadHome,
  setFilterValue,
  switchSite,
} from '@/stores/tv-hub/home';
import { TvHomeLayoutDialog } from '@/components/media/viewer/video/tv/hub/TvHomeLayoutDialog';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import {
  hubTagStackBelowFrameClass,
  hubTagStackBelowInsetClass,
  hubTagStackChipClass,
  hubTagStackTrackBareClass,
  hubTagStackTrackInMenuClass,
} from '@/lib/ui/hub-tag-stack-styles';
import { cn } from '@/lib/utils';

/**
 * below 区徽标堆叠总视口：多组筛选叠在一起时不能各自 max-h-32 无限长高，
 * 否则 PageToolbar(shrink-0) 会把内容区挤出视口且自身不滚。
 */
const BELOW_STACK_SCROLL_CLASS =
  'max-h-[min(36vh,14rem)] min-h-0 space-y-1.5 overflow-y-auto overscroll-contain scroll-gutter-stable-both';

/** 分组下拉内芯片：选中悬停不切到 accent 文字色 */
const FILTER_CHIP_CLASS = (selected: boolean) =>
  cn(
    'inline-flex rounded-md px-2.5 py-1.5 text-xs transition-colors',
    selected
      ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
      : 'bg-muted/60 hover:bg-accent hover:text-accent-foreground',
  );

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

function HubSiteSelect() {
  const state = getTvHomeState;
  const siteKeys = createMemo(() => state().sites.map((s) => s.key));
  const siteLabels = createMemo(
    () =>
      Object.fromEntries(state().sites.map((s) => [s.key, s.name])) as Record<string, string>,
  );

  return (
    <Show when={siteKeys().length > 0}>
      <AppSelect
        value={state().siteKey}
        onChange={(value) => {
          if (value == null || value === state().siteKey) return;
          switchSite(value);
        }}
        options={siteKeys()}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {siteLabels()[itemProps.item.rawValue as string] ?? String(itemProps.item.rawValue)}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger layout="compact" class="h-9 w-28 sm:w-32" aria-label="站点">
          <AppSelectValue>
            {(selectState) => {
              const raw = selectState.selectedOption();
              return raw != null ? (siteLabels()[raw as string] ?? String(raw)) : '';
            }}
          </AppSelectValue>
          <AppSelectIcon />
        </AppSelectTrigger>
        <ViewerAppSelectContent>
          <AppSelectListbox />
        </ViewerAppSelectContent>
      </AppSelect>
    </Show>
  );
}

function HubClassGroupedSelect() {
  const state = getTvHomeState;
  const [open, setOpen] = createSignal(false);
  const className = () =>
    state().classes.find((c) => c.type_id === state().tid)?.type_name ?? '全部分类';
  const hasClasses = () => state().classes.length > 0;

  const selectClass = (tid: string) => {
    void loadCategory(tid, 1);
    setOpen(false);
  };

  return (
    <Show when={hasClasses()}>
      <AppDropdownMenu open={open()} onOpenChange={setOpen} placement="bottom-start">
        <AppDropdownMenuTrigger
          as={(triggerProps: Record<string, unknown>) => (
            <AppDropdownMenuButtonTrigger
              triggerProps={triggerProps}
              variant="outline"
              size="sm"
              class="h-9 w-28 sm:w-32 justify-between gap-1 border-border/60 bg-background px-2.5 font-normal"
              aria-label="分类"
            >
              <span class="min-w-0 truncate">{className()}</span>
              <ChevronDownIcon class="h-3.5 w-3.5 shrink-0 opacity-50" />
            </AppDropdownMenuButtonTrigger>
          )}
        />
        <AppDropdownMenuContent
          layout="plain"
          class="w-[min(40rem,calc(100dvw-2rem))] max-h-[min(20rem,65dvh)] p-2"
        >
          <div class={hubTagStackTrackInMenuClass} role="listbox" aria-label="分类列表">
            <For each={state().classes}>
              {(c) => (
                <button
                  type="button"
                  class={FILTER_CHIP_CLASS(state().tid === c.type_id)}
                  onClick={() => selectClass(c.type_id)}
                >
                  {c.type_name}
                </button>
              )}
            </For>
          </div>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </Show>
  );
}

function HubClassStacked() {
  const state = getTvHomeState;
  const ui = getTvHomeUi;
  const chipClass = (selected: boolean) =>
    hubTagStackChipClass(selected, ui().tagStackDensity, { keepHoverFg: true });

  return (
    <Show when={state().classes.length > 0}>
      <div class={hubTagStackTrackBareClass} role="listbox" aria-label="分类">
        <For each={state().classes}>
          {(c) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              class={chipClass(state().tid === c.type_id)}
              aria-selected={state().tid === c.type_id}
              onClick={() => void loadCategory(c.type_id, 1)}
            >
              <span class="min-w-0 truncate">{c.type_name}</span>
            </Button>
          )}
        </For>
      </div>
    </Show>
  );
}

function HubFilterGroupedSelect() {
  const state = getTvHomeState;
  const [open, setOpen] = createSignal(false);
  const entries = createMemo(() => Object.entries(state().filters));
  const hasFilters = () => entries().length > 0;

  const summary = () => {
    const active = entries()
      .map(([key, opts]) => {
        const v = state().extend[key];
        if (!v) return null;
        const opt = opts.find((o) => o.v === v);
        return opt?.n ?? v;
      })
      .filter(Boolean);
    if (!active.length) return '筛选';
    if (active.length === 1) return active[0] as string;
    return `已选 ${active.length}`;
  };

  return (
    <Show when={hasFilters()}>
      <AppDropdownMenu open={open()} onOpenChange={setOpen} placement="bottom-start">
        <AppDropdownMenuTrigger
          as={(triggerProps: Record<string, unknown>) => (
            <AppDropdownMenuButtonTrigger
              triggerProps={triggerProps}
              variant="outline"
              size="sm"
              class="h-9 w-28 sm:w-32 justify-between gap-1 border-border/60 bg-background px-2.5 font-normal"
              aria-label="筛选"
            >
              <span class="min-w-0 truncate">{summary()}</span>
              <ChevronDownIcon class="h-3.5 w-3.5 shrink-0 opacity-50" />
            </AppDropdownMenuButtonTrigger>
          )}
        />
        <AppDropdownMenuContent
          layout="plain"
          class="w-[min(40rem,calc(100dvw-2rem))] max-h-[min(24rem,70dvh)] p-2"
        >
          <div class="space-y-2">
            <For each={entries()}>
              {([fkey, opts]) => (
                <dl class="space-y-1.5">
                  <dt class="pt-1 text-xs text-muted-foreground">{fkey}</dt>
                  <dd class="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class={FILTER_CHIP_CLASS(!state().extend[fkey])}
                      onClick={() => setFilterValue(fkey, '')}
                    >
                      全部
                    </button>
                    <For each={opts}>
                      {(opt) => (
                        <button
                          type="button"
                          class={FILTER_CHIP_CLASS(state().extend[fkey] === opt.v)}
                          onClick={() =>
                            setFilterValue(
                              fkey,
                              state().extend[fkey] === opt.v ? '' : opt.v,
                            )
                          }
                        >
                          {opt.n}
                        </button>
                      )}
                    </For>
                  </dd>
                </dl>
              )}
            </For>
          </div>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </Show>
  );
}

function HubFilterStacked() {
  const state = getTvHomeState;
  const ui = getTvHomeUi;
  const entries = createMemo(() => Object.entries(state().filters));
  const chipClass = (selected: boolean) =>
    hubTagStackChipClass(selected, ui().tagStackDensity, { keepHoverFg: true });

  return (
    <Show when={entries().length > 0}>
      <div class="space-y-1.5">
        <For each={entries()}>
          {([fkey, opts]) => (
            <div class="flex min-w-0 items-start gap-2">
              <span class="mt-1.5 w-14 shrink-0 truncate text-xs text-muted-foreground">
                {fkey}
              </span>
              <div
                class={cn(hubTagStackTrackBareClass, 'min-w-0 flex-1')}
                role="listbox"
                aria-label={fkey}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class={chipClass(!state().extend[fkey])}
                  aria-selected={!state().extend[fkey]}
                  onClick={() => setFilterValue(fkey, '')}
                >
                  <span class="min-w-0 truncate">全部</span>
                </Button>
                <For each={opts}>
                  {(opt) => (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class={chipClass(state().extend[fkey] === opt.v)}
                      aria-selected={state().extend[fkey] === opt.v}
                      onClick={() =>
                        setFilterValue(
                          fkey,
                          state().extend[fkey] === opt.v ? '' : opt.v,
                        )
                      }
                    >
                      <span class="min-w-0 truncate">{opt.n}</span>
                    </Button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

export function TvHomePaneToolbar() {
  const state = getTvHomeState;
  const ui = getTvHomeUi;
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [layoutDialogOpen, setLayoutDialogOpen] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <>
      <Show when={ui().classControl === 'grouped'}>
        <HubClassGroupedSelect />
      </Show>

      <Show when={ui().filterControl === 'grouped'}>
        <HubFilterGroupedSelect />
      </Show>

      <Show when={ui().siteControl === 'select'}>
        <HubSiteSelect />
      </Show>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={state().loading || !state().configUrl}
          onClick={() => void loadHome()}
        >
          <RefreshIcon class={cn('h-4 w-4', state().loading && 'animate-spin')} />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新</AppTooltipContent>
      </AppTooltip>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            站点选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeSiteControl('select')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().siteControl === 'select'} />
            <span>下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeSiteControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().siteControl === 'tabs'} />
            <span>标签 Tab</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            分类选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeClassControl('grouped')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().classControl === 'grouped'} />
            <span>分组下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeClassControl('stacked')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().classControl === 'stacked'} />
            <span>徽标堆叠</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            筛选选择风格
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeFilterControl('grouped')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().filterControl === 'grouped'} />
            <span>分组下拉</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomeFilterControl('stacked')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().filterControl === 'stacked'} />
            <span>徽标堆叠</span>
          </AppDropdownMenuItem>
          <Show when={ui().classControl === 'stacked' || ui().filterControl === 'stacked'}>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
              徽标堆叠密度
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => setTvHomeTagStackDensity('comfortable')}
              class="flex items-center gap-2"
            >
              <MenuRadioIndicator selected={ui().tagStackDensity === 'comfortable'} />
              <span>标准</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => setTvHomeTagStackDensity('compact')}
              class="flex items-center gap-2"
            >
              <MenuRadioIndicator selected={ui().tagStackDensity === 'compact'} />
              <span>紧凑</span>
            </AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            列表分页方式
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTvHomePaginationPreference('scroll')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'scroll'} />
            <span>滚动加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => {
              setTvHomePaginationPreference('pagination');
              void loadCategory(state().tid || state().classes[0]?.type_id || '', 1, {
                force: true,
              });
            }}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={ui().paginationPreference === 'pagination'} />
            <span>分页加载</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem onSelect={() => setLayoutDialogOpen(true)}>
            <LayoutIcon class="h-4 w-4" />
            <span>影视布局</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <TvHomeLayoutDialog open={layoutDialogOpen()} onOpenChange={setLayoutDialogOpen} />
    </>
  );
}

export function TvHomePaneBelow() {
  const state = getTvHomeState;
  const ui = getTvHomeUi;
  const siteKeys = createMemo(() => state().sites.map((s) => s.key));
  const siteLabels = createMemo(
    () =>
      Object.fromEntries(state().sites.map((s) => [s.key, s.name])) as Record<string, string>,
  );

  const showTabsRow = () => ui().siteControl === 'tabs' && siteKeys().length > 0;
  const showStackedClass = () => ui().classControl === 'stacked';
  const showStackedFilter = () => ui().filterControl === 'stacked';

  return (
    <Show when={showTabsRow() || showStackedClass() || showStackedFilter()}>
      <div class={hubTagStackBelowFrameClass}>
        <Show when={showTabsRow()}>
          <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-3')}>
            <AppTabs
              value={state().siteKey}
              onChange={(value) => {
                if (value === state().siteKey) return;
                switchSite(value);
              }}
              options={siteKeys()}
              labels={siteLabels()}
              ariaLabel="站点"
              variant="drawer-inline"
              layout="inline"
            />
          </div>
        </Show>
        <Show when={showStackedClass() || showStackedFilter()}>
          <div class={hubTagStackBelowInsetClass}>
            <div class={BELOW_STACK_SCROLL_CLASS} role="region" aria-label="分类与筛选">
              <Show when={showStackedClass()}>
                <HubClassStacked />
              </Show>
              <Show when={showStackedFilter()}>
                <HubFilterStacked />
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
