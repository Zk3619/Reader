/**
 * 番剧浏览 + 详情 + 选源（BGM 元数据中心）
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onMount,
} from 'solid-js';
import { Button } from '@/components/ui/button';
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
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppDropdownMenuIconTrigger,
} from '@/components/shared/AppDropdownMenu';
import { MoreIcon } from '@/components/shared/icons';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { showAppToast } from '@/components/shared/AppToasts';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { cn } from '@/lib/utils';
import {
  displayName,
  fetchBangumiCalendar,
  fetchBangumiComments,
  fetchBangumiRankedList,
  searchBangumiSubjects,
  type BangumiSubject,
} from '@/lib/media/video/bangumi/meta';
import { ensureBangumiDaoMigrated } from '@/lib/media/video/bangumi/dao-bridge';
import {
  isBangumiKept,
  removeBangumiKeep,
  upsertBangumiKeep,
  upsertBangumiPlayHistory,
} from '@/lib/media/video/bangumi/dao-bridge';
import {
  getBangumiUi,
  openBangumiSubject,
  backBangumiBrowse,
  setBangumiSourceHits,
  setBangumiView,
} from '@/stores/tv-hub/bangumi-ui';
import { loadBangumiRules } from '@/lib/media/video/bangumi/rules';
import {
  loadDetail,
  resolvePlayUrl,
  searchAllRules,
  type BangumiSearchHit,
} from '@/lib/media/video/bangumi/engine';
import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
import { searchTraceMoe } from '@/lib/media/video/bangumi/meta/trace-moe';
import { tryMatchDanmaku } from '@/lib/media/video/danmaku/match';
import { cacheBangumiEpisode } from '@/lib/media/video/cache/episode-disk-cache';

const WEEK_FILTER = ['全部', '一', '二', '三', '四', '五', '六', '日'] as const;

export function TvBangumiPane() {
  const ui = getBangumiUi;
  const [q, setQ] = createSignal('');
  const [tag, setTag] = createSignal('日本');
  const [weekFilter, setWeekFilter] = createSignal('全部');
  const [searchHits, setSearchHits] = createSignal<BangumiSubject[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [calTick, setCalTick] = createSignal(0);
  const [listTick, setListTick] = createSignal(0);

  onMount(() => {
    void ensureBangumiDaoMigrated();
  });

  const [calendar] = createResource(
    () => calTick(),
    () => fetchBangumiCalendar(),
  );
  const [ranked] = createResource(
    () => [listTick(), tag()] as const,
    ([, t]) => fetchBangumiRankedList({ tag: t, limit: 36 }),
  );

  const todayWeekday = () => {
    const js = new Date().getDay();
    return js === 0 ? 7 : js;
  };

  const calendarFlat = createMemo(() => {
    const days = calendar() || [];
    const wf = weekFilter();
    if (wf === '全部') {
      const today = days.find((d) => d.weekday === todayWeekday());
      return today?.items ?? days.flatMap((d) => d.items).slice(0, 24);
    }
    const idx = WEEK_FILTER.indexOf(wf as (typeof WEEK_FILTER)[number]);
    if (idx <= 0) return [];
    return days.find((d) => d.weekday === idx)?.items ?? [];
  });

  async function runSearch() {
    const kw = q().trim();
    if (!kw) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    try {
      const r = await searchBangumiSubjects(kw, { limit: 30 });
      setSearchHits(r.items);
    } catch (e) {
      void showAppToast({
        title: '搜索失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setSearching(false);
    }
  }

  async function onTraceMoeFile(file: File) {
    try {
      const r = await searchTraceMoe(file);
      if (!r.bgmId && !r.title) {
        void showAppToast({ title: '未识别到番剧', variant: 'warning' });
        return;
      }
      if (r.bgmId) {
        const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
        await openBangumiById(r.bgmId);
        return;
      }
      setQ(r.title || '');
      await runSearch();
    } catch (e) {
      void showAppToast({
        title: '以图搜番失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  return (
    <TvHubPageShell section="bangumi">
      <div class={cn(tvHubPageContentInsetClass, 'flex h-full min-h-0 flex-col gap-3 py-2')}>
        <Show when={ui().view === 'browse'} fallback={<BangumiDetailOrSources />}>
          <div class="flex flex-wrap items-center gap-2">
            <AppTextField class="min-w-[12rem] flex-1">
              <AppTextFieldInput
                placeholder="搜索 Bangumi…"
                value={q()}
                onInput={(e) => setQ(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
            </AppTextField>
            <Button size="sm" disabled={searching()} onClick={() => void runSearch()}>
              {searching() ? '搜索中…' : '搜索'}
            </Button>
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <AppDropdownMenuIconTrigger {...triggerProps} aria-label="更多">
                    <MoreIcon class="h-4 w-4" />
                  </AppDropdownMenuIconTrigger>
                )}
              />
              <AppDropdownMenuContent>
                <AppDropdownMenuItem
                  onSelect={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => {
                      const f = input.files?.[0];
                      if (f) void onTraceMoeFile(f);
                    };
                    input.click();
                  }}
                >
                  以图搜番
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  onSelect={() => {
                    setCalTick((n) => n + 1);
                    setListTick((n) => n + 1);
                  }}
                >
                  刷新时间表 / 列表
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>

          <Show when={searchHits().length}>
            <section class="space-y-2">
              <h3 class="text-sm font-semibold">搜索结果</h3>
              <SubjectGrid
                items={searchHits()}
                onOpen={(s) => openBangumiSubject(s)}
              />
            </section>
          </Show>

          <section class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">放送时间表</h3>
              <div class="flex flex-wrap gap-1">
                <For each={[...WEEK_FILTER]}>
                  {(w) => (
                    <Button
                      size="sm"
                      variant={weekFilter() === w ? 'default' : 'outline'}
                      class="h-7 px-2 text-xs"
                      onClick={() => setWeekFilter(w)}
                    >
                      {w === '全部' ? '今日' : `周${w}`}
                    </Button>
                  )}
                </For>
              </div>
            </div>
            <Show
              when={!calendar.loading}
              fallback={<p class="text-xs text-muted-foreground">加载时间表…</p>}
            >
              <SubjectGrid
                items={calendarFlat()}
                onOpen={(s) => openBangumiSubject(s)}
                empty="暂无放送数据（需网络访问 Bangumi API）"
              />
            </Show>
          </section>

          <section class="min-h-0 flex-1 space-y-2 overflow-auto">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold">番剧列表</h3>
              <AppSelect
                value={tag()}
                onChange={(v) => {
                  if (v) setTag(v);
                }}
                options={['日本', '动画', '国产', '欧美']}
                itemComponent={(p) => (
                  <AppSelectItem item={p.item}>{String(p.item.rawValue)}</AppSelectItem>
                )}
              >
                <AppSelectTrigger layout="form" class="h-8 w-28" aria-label="标签筛选">
                  <AppSelectValue>{() => tag()}</AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
            <Show
              when={!ranked.loading}
              fallback={<p class="text-xs text-muted-foreground">加载列表…</p>}
            >
              <SubjectGrid
                items={ranked()?.items ?? []}
                onOpen={(s) => openBangumiSubject(s)}
                empty="暂无列表"
              />
            </Show>
          </section>
        </Show>
      </div>
    </TvHubPageShell>
  );
}

function SubjectGrid(props: {
  items: BangumiSubject[];
  onOpen: (s: BangumiSubject) => void;
  empty?: string;
}) {
  return (
    <Show
      when={props.items.length}
      fallback={
        <p class="text-xs text-muted-foreground">{props.empty || '暂无'}</p>
      }
    >
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        <For each={props.items}>
          {(s) => (
            <button
              type="button"
              class="group flex flex-col gap-1 text-left"
              onClick={() => props.onOpen(s)}
            >
              <div class="aspect-[3/4] overflow-hidden rounded-md bg-muted">
                <Show when={s.cover}>
                  <img
                    src={s.cover}
                    alt=""
                    class="h-full w-full object-cover transition group-hover:scale-105"
                    loading="lazy"
                  />
                </Show>
              </div>
              <span class="line-clamp-2 text-xs">{displayName(s)}</span>
              <Show when={s.score > 0}>
                <span class="text-[10px] text-muted-foreground">{s.score.toFixed(1)}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function BangumiDetailOrSources() {
  const ui = getBangumiUi;
  return (
    <Show when={ui().view === 'sources'} fallback={<BangumiDetailView />}>
      <BangumiSourcesView />
    </Show>
  );
}

function BangumiDetailView() {
  const ui = getBangumiUi;
  const subject = () => ui().subject;
  const [kept, setKept] = createSignal(false);
  const [comments] = createResource(
    () => subject()?.id,
    (id) => (id ? fetchBangumiComments(id) : Promise.resolve([])),
  );

  createEffect(() => {
    const id = subject()?.id;
    if (!id) return;
    void isBangumiKept(id).then(setKept);
  });

  async function toggleKeep() {
    const s = subject();
    if (!s) return;
    if (kept()) {
      await removeBangumiKeep(s.id);
      setKept(false);
    } else {
      await upsertBangumiKeep({
        bgmId: s.id,
        title: displayName(s),
        cover: s.cover,
      });
      setKept(true);
    }
  }

  async function openSources() {
    const s = subject();
    if (!s) return;
    const kw = displayName(s);
    const { hits, errors } = await searchAllRules(loadBangumiRules(), kw);
    if (errors.length) {
      void showAppToast({
        title: '部分规则失败',
        description: errors.slice(0, 3).join('；'),
        variant: 'warning',
      });
    }
    setBangumiSourceHits(hits, kw);
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div class="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => backBangumiBrowse()}>
          返回
        </Button>
        <h2 class="truncate text-base font-semibold">{displayName(subject()!)}</h2>
      </div>
      <div class="flex flex-wrap gap-4">
        <Show when={subject()?.cover}>
          <img
            src={subject()!.cover}
            alt=""
            class="h-48 w-36 shrink-0 rounded-md object-cover"
          />
        </Show>
        <div class="min-w-0 flex-1 space-y-2 text-sm">
          <p class="text-muted-foreground">
            {subject()?.airDate || '—'}
            <Show when={subject()!.score > 0}> · 评分 {subject()!.score.toFixed(1)}</Show>
          </p>
          <p class="whitespace-pre-wrap text-xs leading-relaxed opacity-90">
            {subject()?.summary || '暂无简介'}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void toggleKeep()}>
              {kept() ? '取消收藏' : '加入收藏'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void openSources()}>
              选源播放
            </Button>
          </div>
        </div>
      </div>
      <section class="space-y-2">
        <h3 class="text-sm font-semibold">短评</h3>
        <Show
          when={(comments() || []).length}
          fallback={<p class="text-xs text-muted-foreground">暂无短评</p>}
        >
          <ul class="space-y-2">
            <For each={comments() || []}>
              {(c) => (
                <li class="rounded-md border border-border/60 p-2 text-xs">
                  <div class="mb-1 font-medium">{c.userName}</div>
                  <p class="whitespace-pre-wrap text-muted-foreground">{c.comment}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}

function BangumiSourcesView() {
  const ui = getBangumiUi;
  const [busy, setBusy] = createSignal('');
  const [episodes, setEpisodes] = createSignal<
    { name: string; url: string; ruleId: string }[]
  >([]);
  const [activeHit, setActiveHit] = createSignal<BangumiSearchHit | null>(null);

  async function pickHit(hit: BangumiSearchHit) {
    setActiveHit(hit);
    setBusy(hit.url);
    try {
      const rule = loadBangumiRules().find((r) => r.id === hit.ruleId);
      if (!rule) throw new Error('规则已删除');
      const detail = await loadDetail(rule, hit.url);
      setEpisodes(detail.episodes.map((e) => ({ ...e, ruleId: rule.id })));
    } catch (e) {
      void showAppToast({
        title: '加载分集失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
      setEpisodes([]);
    } finally {
      setBusy('');
    }
  }

  async function playEp(ep: { name: string; url: string; ruleId: string }) {
    const rule = loadBangumiRules().find((r) => r.id === ep.ruleId);
    const s = ui().subject;
    if (!rule || !s) return;
    setBusy(ep.url);
    try {
      const resolved = await resolvePlayUrl(rule, ep.url);
      const title = `${displayName(s)} ${ep.name}`;
      await openRoutedPlayback(resolved.url, {
        title,
        sourceKind: 'bangumi',
        headers: resolved.headers,
      });
      await upsertBangumiPlayHistory({
        bgmId: s.id,
        title: displayName(s),
        cover: s.cover,
        episodeName: ep.name,
        ruleId: rule.id,
        detailUrl: activeHit()?.url,
        episodeUrl: ep.url,
      });
      try {
        const matched = await tryMatchDanmaku({
          fileNameHint: title,
          playUrl: resolved.url,
        });
        if (matched) {
          void showAppToast({
            title: '弹幕已匹配',
            description: `${matched.label}（${matched.danmu.length} 条）`,
            variant: 'success',
          });
        }
      } catch {
        /* */
      }
      void cacheBangumiEpisode({
        bgmId: s.id,
        episodeUrl: ep.url,
        mediaUrl: resolved.url,
        title,
      }).catch(() => undefined);
    } catch (e) {
      void showAppToast({
        title: '播放失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div class="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setBangumiView('detail')}>
          返回详情
        </Button>
        <h2 class="text-sm font-semibold">
          选源 · {ui().sourceKeyword || displayName(ui().subject!)}
        </h2>
      </div>
      <Show
        when={ui().sourceHits.length}
        fallback={
          <p class="text-xs text-muted-foreground">
            无规则命中。请在影视设置 → 番剧中添加/订阅规则。
          </p>
        }
      >
        <ul class="space-y-1">
          <For each={ui().sourceHits}>
            {(h) => (
              <li>
                <button
                  type="button"
                  class={cn(
                    'w-full rounded-md border px-3 py-2 text-left text-sm',
                    activeHit()?.url === h.url && 'border-primary bg-muted/40',
                  )}
                  disabled={!!busy()}
                  onClick={() => void pickHit(h)}
                >
                  <span class="font-medium">{h.title}</span>
                  <span class="ml-2 text-xs text-muted-foreground">{h.ruleName}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={episodes().length}>
        <div class="flex flex-wrap gap-2">
          <For each={episodes()}>
            {(ep) => (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy()}
                onClick={() => void playEp(ep)}
              >
                {busy() === ep.url ? '…' : ep.name}
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
