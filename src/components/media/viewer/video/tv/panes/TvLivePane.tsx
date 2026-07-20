/**
 * 影视直播页：多源 / 分组 / 频道 / EPG / 线路 / 收藏（对齐 TV-fongmi LiveActivity 能力子集）
 */

import { For, Show, createEffect, createMemo } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
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
import { RefreshIcon, StarIcon } from '@/components/shared/icons';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import {
  currentProgramme,
  formatProgramme,
  formatProgrammeRange,
} from '@/lib/media/tv/live/epg';
import { cn } from '@/lib/utils';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  bootstrapTvLive,
  getChannelProgrammes,
  getSelectedChannel,
  getTvLiveState,
  getVisibleChannels,
  isChannelKept,
  loadLiveSource,
  playLiveChannel,
  selectLiveChannel,
  setLiveGroup,
  setLiveLineIndex,
  setLiveQuery,
  toggleLiveKeep,
  TV_LIVE_KEEP_GROUP,
} from '@/stores/tv-hub/live';
import { getTvHomeState } from '@/stores/tv-hub/home';

function LiveSourceSelect() {
  const state = getTvLiveState;
  const names = createMemo(() => state().sources.map((s) => s.name));

  return (
    <Show when={names().length > 0}>
      <AppSelect
        value={state().sourceName}
        onChange={(value) => {
          if (value == null || value === state().sourceName) return;
          void loadLiveSource(value);
        }}
        options={names()}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {String(itemProps.item.rawValue)}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger layout="compact" class="h-9 w-36 sm:w-44" aria-label="直播源">
          <AppSelectValue>
            {(sel) => {
              const raw = sel.selectedOption();
              return raw != null ? String(raw) : '直播源';
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

function LiveToolbar() {
  const state = getTvLiveState;
  return (
    <>
      <LiveSourceSelect />
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={state().loading || !state().sourceName}
          onClick={() => void loadLiveSource(state().sourceName)}
        >
          <RefreshIcon class={cn('h-4 w-4', state().loading && 'animate-spin')} />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新直播源</AppTooltipContent>
      </AppTooltip>
    </>
  );
}

function LiveGroupBelow() {
  const state = getTvLiveState;
  const groupNames = createMemo(() => state().groups.map((g) => g.name));
  const labels = createMemo(() => {
    const map: Record<string, string> = {};
    for (const g of state().groups) {
      const n = g.channel.length;
      map[g.name] =
        g.name === TV_LIVE_KEEP_GROUP ? `${g.name}(${n})` : `${g.name} · ${n}`;
    }
    return map;
  });

  return (
    <Show when={groupNames().length > 0}>
      <div class={cn(pageToolbarBelowScrollTrack, 'px-4 pb-2')}>
        <AppTabs
          value={state().groupName}
          onChange={(value) => setLiveGroup(value)}
          options={groupNames()}
          labels={labels()}
          ariaLabel="直播分组"
          variant="drawer-inline"
          layout="inline"
        />
      </div>
    </Show>
  );
}

export function TvLivePane() {
  const state = getTvLiveState;
  const home = getTvHomeState();
  let lastBootRevision = -1;

  // 配置导入 / 切换后重载（keep-alive 下 onMount 不会再跑）；同 revision 不重复
  createEffect(() => {
    const rev = home.configRevision;
    if (rev === lastBootRevision) return;
    lastBootRevision = rev;
    void bootstrapTvLive();
  });

  const selected = createMemo(() => getSelectedChannel());
  const visible = createMemo(() => getVisibleChannels());
  const programmes = createMemo(() => getChannelProgrammes());
  const nowProg = createMemo(() => {
    const ch = selected();
    if (!ch) return undefined;
    return currentProgramme(state().epg, ch.tvgId || ch.name);
  });

  const description = () => {
    if (state().loading) return '加载直播源…';
    if (state().error) return state().error;
    if (!state().sourceName) {
      return (
        home.liveNote ||
        '请先在设置中导入直播源（可与影视使用不同配置）'
      );
    }
    const n = state().channels.filter((c) => c.group !== TV_LIVE_KEEP_GROUP).length;
    const epgN = state().epg.length;
    return `${state().sourceName} · ${n} 频道${epgN ? ` · EPG ${epgN}` : ''}`;
  };

  return (
    <TvHubPageShell
      section="live"
      description={description()}
      toolbar={<LiveToolbar />}
      below={<LiveGroupBelow />}
      belowHorizontalWheel
      delegateScroll
    >
      <Show when={state().error && !state().loading}>
        <div class={cn('py-6 text-center', tvHubPageContentInsetClass)}>
          <p class="text-sm text-muted-foreground">{state().error}</p>
        </div>
      </Show>

      <Show when={!state().error}>
        <div
          class={cn(
            'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-2 lg:flex-row',
            tvHubPageContentInsetClass,
          )}
        >
          {/* 频道列 */}
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/10">
            <div class="flex shrink-0 items-center gap-2 border-b border-border/40 p-2">
              <AppTextField layout="compact" class="min-w-0 flex-1">
                <AppTextFieldInput
                  value={state().query}
                  onInput={(e: Event) =>
                    setLiveQuery((e.currentTarget as HTMLInputElement).value)
                  }
                  placeholder="搜索频道"
                />
              </AppTextField>
              <Show when={selected()?.urls.length && selected()!.urls.length > 1}>
                <AppSelect
                  value={String(state().lineIndex)}
                  onChange={(v) => {
                    if (v != null) setLiveLineIndex(Number(v));
                  }}
                  options={selected()!.urls.map((_, i) => String(i))}
                  itemComponent={(itemProps) => (
                    <AppSelectItem item={itemProps.item}>
                      线路 {Number(itemProps.item.rawValue) + 1}
                    </AppSelectItem>
                  )}
                >
                  <AppSelectTrigger layout="compact" class="h-8 w-24" aria-label="线路">
                    <AppSelectValue>
                      {(sel) => {
                        const raw = sel.selectedOption();
                        return raw != null ? `线路 ${Number(raw) + 1}` : '线路';
                      }}
                    </AppSelectValue>
                    <AppSelectIcon />
                  </AppSelectTrigger>
                  <ViewerAppSelectContent>
                    <AppSelectListbox />
                  </ViewerAppSelectContent>
                </AppSelect>
              </Show>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              <Show when={state().loading}>
                <p class="px-2 py-4 text-sm text-muted-foreground">加载中…</p>
              </Show>
              <Show when={!state().loading && visible().length === 0}>
                <p class="px-2 py-4 text-sm text-muted-foreground">本组暂无频道</p>
              </Show>
              <ul class="space-y-0.5">
                <For each={visible()}>
                  {(ch) => {
                    const active = () =>
                      state().channelName === ch.name && state().groupName === ch.group;
                    const prog = () =>
                      currentProgramme(state().epg, ch.tvgId || ch.name);
                    const kept = () => isChannelKept(ch.name);
                    return (
                      <li>
                        <div
                          class={cn(
                            'flex items-stretch gap-1 rounded-md border border-transparent px-1 py-1',
                            active() && 'border-primary/40 bg-primary/5',
                          )}
                        >
                          <button
                            type="button"
                            class="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
                            onClick={() => selectLiveChannel(ch)}
                            onDblClick={() =>
                              playLiveChannel({ channel: ch, lineIndex: state().lineIndex })
                            }
                          >
                            <div class="flex items-center gap-2">
                              <Show when={ch.logo}>
                                <img
                                  src={ch.logo}
                                  alt=""
                                  class="h-7 w-7 shrink-0 rounded object-cover"
                                  loading="lazy"
                                />
                              </Show>
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-medium">{ch.name}</p>
                                <p class="truncate text-[11px] text-muted-foreground">
                                  {formatProgramme(prog())}
                                  {ch.urls.length > 1 ? ` · ${ch.urls.length} 线` : ''}
                                </p>
                              </div>
                            </div>
                          </button>
                          <AppTooltip>
                            <AppTooltipTrigger
                              as={Button}
                              type="button"
                              size="icon"
                              variant="ghost"
                              class="h-8 w-8 shrink-0"
                              aria-label={kept() ? '取消收藏' : '收藏'}
                              onClick={() => void toggleLiveKeep(ch)}
                            >
                              <StarIcon
                                class={cn(
                                  'h-4 w-4',
                                  kept()
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-muted-foreground',
                                )}
                              />
                            </AppTooltipTrigger>
                            <AppTooltipContent>
                              {kept() ? '取消收藏' : '收藏'}
                            </AppTooltipContent>
                          </AppTooltip>
                          <Button
                            type="button"
                            size="sm"
                            variant={active() ? 'default' : 'outline'}
                            class="h-8 shrink-0 px-2 text-xs"
                            onClick={() =>
                              playLiveChannel({ channel: ch, lineIndex: state().lineIndex })
                            }
                          >
                            播放
                          </Button>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </div>
            <div class="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-2 py-1.5">
              <Button
                type="button"
                size="sm"
                disabled={!selected()}
                onClick={() => playLiveChannel()}
              >
                播放当前
              </Button>
              <Show
                when={
                  !!(selected()?.catchup || selected()?.catchupSource) && !!nowProg()
                }
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    playLiveChannel({ catchup: true, programme: nowProg() })
                  }
                >
                  回看当前节目
                </Button>
              </Show>
            </div>
          </div>

          {/* EPG 列 */}
          <div class="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/10 lg:w-[min(22rem,38%)]">
            <div class="shrink-0 border-b border-border/40 px-3 py-2">
              <p class="truncate text-sm font-semibold">
                {selected()?.name ?? '节目单'}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {state().epgLoading
                  ? '加载 EPG…'
                  : formatProgramme(nowProg())}
              </p>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              <Show when={!programmes().length}>
                <p class="px-2 py-4 text-sm text-muted-foreground">
                  {state().epg.length ? '该频道暂无节目单' : '未配置或未加载 EPG'}
                </p>
              </Show>
              <ul class="space-y-0.5">
                <For each={programmes()}>
                  {(p) => {
                    const liveNow = () => {
                      const now = Date.now();
                      return p.start <= now && (p.stop === 0 || p.stop >= now);
                    };
                    const canCatchup = () =>
                      !!(selected()?.catchup || selected()?.catchupSource);
                    return (
                      <li>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as="button"
                            type="button"
                            class={cn(
                              'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent/50',
                              liveNow() && 'bg-primary/5 ring-1 ring-primary/30',
                            )}
                            disabled={!canCatchup()}
                            onClick={() => {
                              if (!canCatchup()) return;
                              playLiveChannel({ catchup: true, programme: p });
                            }}
                          >
                            <span class="text-[11px] tabular-nums text-muted-foreground">
                              {formatProgrammeRange(p)}
                            </span>
                            <span class="line-clamp-2 font-medium leading-snug">{p.title}</span>
                          </AppTooltipTrigger>
                          <AppTooltipContent>
                            {canCatchup() ? '点击回看' : '该频道不支持回看'}
                          </AppTooltipContent>
                        </AppTooltip>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </div>
          </div>
        </div>
      </Show>
    </TvHubPageShell>
  );
}
