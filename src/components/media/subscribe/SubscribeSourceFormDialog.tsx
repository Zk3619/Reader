/**
 * 订阅源表单弹窗（对齐 Folo FeedForm 布局）
 * 发现页「订阅」与管理页「编辑」共用。
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
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
  AuthorIcon,
  BellIcon,
  FileTextIcon,
  GroupAudioIcon,
  GroupVideoIcon,
  ImageIcon,
  LayoutIcon,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import { SubscribeEntryPreviewItem } from '@/components/media/subscribe/SubscribeEntryItem';
import { cn } from '@/lib/utils';
import type { SubSourceRow } from '@/lib/database/sub-sources';
import {
  fetchFoloFeedByUrl,
  formatFoloHeatCount,
} from '@/lib/subscribe/folo-cloud';
import {
  createSubscribeSource,
  listSubscribeCategories,
  refreshSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import { parseSubscribeSourceMeta } from '@/lib/subscribe/presentation';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_STORED,
  defaultSubscribeFeedViewForWrite,
  isSubscribeFeedViewGrid,
  subscribeFeedViewNumberToKind,
  type SubscribeFeedViewStored,
} from '@/lib/subscribe/feed-view';

const UNCATEGORIZED = '';

export type SubscribeSourceFormMode = 'create' | 'edit';

export type SubscribeSourceFormDraft = {
  mode: SubscribeSourceFormMode;
  /** edit 必填 */
  sourceId?: string;
  url: string;
  /** 源默认标题（填充按钮写入） */
  defaultTitle: string;
  /** 当前自定义标题（可空表示用默认） */
  title?: string;
  category?: string;
  view?: number;
  foloFeedId?: string;
  siteUrl?: string | null;
  iconUrl?: string | null;
  description?: string | null;
  badge?: string;
  subscriptionCount?: number | null;
  updatesPerWeek?: number | null;
};

export interface SubscribeSourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: SubscribeSourceFormDraft | null;
  onCreated?: (sourceId: string) => void;
  onUpdated?: (sourceId: string) => void;
}

type PreviewEntry = {
  id: string;
  title: string;
  snippet: string;
  publishedAt?: string | null;
  coverUrl?: string | null;
};

const VIEW_ICON: Record<SubscribeFeedViewStored, Component<{ class?: string }>> = {
  articles: FileTextIcon,
  'social-media': LayoutIcon,
  pictures: ImageIcon,
  videos: GroupVideoIcon,
  audios: GroupAudioIcon,
  notifications: BellIcon,
};

function categoryLabel(value: string) {
  return value.trim() ? value : '未分类';
}

function inferBadge(url: string, explicit?: string): string {
  const badge = String(explicit ?? '').trim();
  if (badge) return badge;
  const u = url.trim().toLowerCase();
  if (u.startsWith('rsshub://') || u.includes('rsshub.')) return 'RSSHub';
  return 'RSS';
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function entrySnippet(raw: string | null | undefined): string {
  const text = stripHtml(String(raw ?? ''));
  if (!text) return '';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function firstImageUrl(html: string | null | undefined): string | null {
  const matches = String(html ?? '').matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi);
  for (const m of matches) {
    const src = String(m[1] ?? '').trim();
    if (!src || /thumbnail\.gif|spacer\.gif|pixel\.gif|1x1\.|blank\./i.test(src)) continue;
    if (src.startsWith('data:')) continue;
    return src;
  }
  return null;
}

export function draftFromSubSource(source: SubSourceRow): SubscribeSourceFormDraft {
  const meta = parseSubscribeSourceMeta(source.metaJson);
  return {
    mode: 'edit',
    sourceId: source.id,
    url: source.url,
    defaultTitle: source.title || source.url,
    title: source.title || '',
    category: source.category?.trim() || UNCATEGORIZED,
    view: source.view,
    foloFeedId: meta.foloFeedId,
    siteUrl: meta.siteUrl,
    iconUrl: meta.iconUrl,
    badge: inferBadge(source.url),
  };
}

function ViewPreviewList(props: {
  view: SubscribeFeedViewStored;
  entries: PreviewEntry[];
  sourceTitle: string;
  sourceUrl: string;
  siteUrl: string | null;
  iconUrl: string | null;
}) {
  const logo = () => ({
    title: props.sourceTitle,
    url: props.sourceUrl,
    siteUrl: props.siteUrl,
    iconUrl: props.iconUrl,
  });
  const items = () =>
    (isSubscribeFeedViewGrid(props.view) ? props.entries.slice(0, 4) : props.entries).map(
      (entry) => ({
        id: entry.id,
        title: entry.title,
        summary: entry.snippet,
        publishedLabel: entry.publishedAt ?? undefined,
        coverUrl: entry.coverUrl,
        feedTitle: props.sourceTitle,
        feedLogo: logo(),
      }),
    );

  return (
    <Show
      when={isSubscribeFeedViewGrid(props.view)}
      fallback={
        <ul class="divide-y">
          <For each={items()}>
            {(entry) => (
              <li>
                <SubscribeEntryPreviewItem view={props.view} entry={entry} />
              </li>
            )}
          </For>
        </ul>
      }
    >
      <div class="grid grid-cols-2 gap-2 p-2">
        <For each={items()}>
          {(entry) => <SubscribeEntryPreviewItem view={props.view} entry={entry} />}
        </For>
      </div>
    </Show>
  );
}

export function SubscribeSourceFormDialog(props: SubscribeSourceFormDialogProps) {
  const [categories, { refetch: refetchCategories }] = createResource(() =>
    listSubscribeCategories(),
  );
  const [title, setTitle] = createSignal('');
  const [category, setCategory] = createSignal(UNCATEGORIZED);
  const [view, setView] = createSignal<SubscribeFeedViewStored>('articles');
  const [busy, setBusy] = createSignal(false);
  const [lookupBusy, setLookupBusy] = createSignal(false);
  const [resolvedTitle, setResolvedTitle] = createSignal('');
  const [resolvedDescription, setResolvedDescription] = createSignal('');
  const [resolvedIcon, setResolvedIcon] = createSignal<string | null>(null);
  const [resolvedSiteUrl, setResolvedSiteUrl] = createSignal<string | null>(null);
  const [resolvedFoloFeedId, setResolvedFoloFeedId] = createSignal<string | undefined>();
  const [subscriptionCount, setSubscriptionCount] = createSignal<number | null>(null);
  const [updatesPerWeek, setUpdatesPerWeek] = createSignal<number | null>(null);
  const [previewEntries, setPreviewEntries] = createSignal<PreviewEntry[]>([]);

  const draft = () => props.draft;
  const isEdit = () => draft()?.mode === 'edit';
  const feedUrl = () => draft()?.url?.trim() || '';
  const displayDefaultTitle = () =>
    resolvedTitle().trim() || draft()?.defaultTitle?.trim() || feedUrl() || '订阅源';
  const badge = () => inferBadge(feedUrl(), draft()?.badge);

  createEffect(
    on(
      () => [props.open, draft()?.sourceId, draft()?.url, draft()?.mode] as const,
      ([open]) => {
        if (!open || !draft()) return;
        const d = draft()!;
        setTitle(d.title ?? '');
        setCategory(d.category?.trim() || UNCATEGORIZED);
        setView(subscribeFeedViewNumberToKind(d.view));
        setResolvedTitle(d.defaultTitle || '');
        setResolvedDescription(d.description?.trim() || '');
        setResolvedIcon(d.iconUrl ?? null);
        setResolvedSiteUrl(d.siteUrl ?? null);
        setResolvedFoloFeedId(d.foloFeedId);
        setSubscriptionCount(
          typeof d.subscriptionCount === 'number' ? d.subscriptionCount : null,
        );
        setUpdatesPerWeek(typeof d.updatesPerWeek === 'number' ? d.updatesPerWeek : null);
        setPreviewEntries([]);
        void refetchCategories();
        void enrichFromFolo(d);
      },
    ),
  );

  async function enrichFromFolo(d: SubscribeSourceFormDraft) {
    const url = d.url.trim();
    if (!url) return;
    setLookupBusy(true);
    try {
      const lookup = await fetchFoloFeedByUrl(url);
      if (!lookup?.feed) return;
      const feed = lookup.feed;
      if (feed.title?.trim()) setResolvedTitle(feed.title.trim());
      if (feed.description?.trim()) setResolvedDescription(feed.description.trim());
      if (feed.image?.trim()) setResolvedIcon(feed.image.trim());
      if (feed.siteUrl?.trim()) setResolvedSiteUrl(feed.siteUrl.trim());
      if (feed.id?.trim()) setResolvedFoloFeedId(feed.id.trim());
      // 发现页带入的 view 优先；否则用 Folo feed.view
      if (d.view == null && typeof feed.view === 'number') {
        setView(subscribeFeedViewNumberToKind(feed.view));
      }
      const entries = (lookup.entries ?? [])
        .slice(0, 6)
        .map((entry, index) => {
          const html = entry.description || entry.content;
          return {
            id: entry.id || `preview-${index}`,
            title: entry.title?.trim() || '无标题',
            snippet: entrySnippet(html),
            publishedAt: entry.publishedAt,
            coverUrl: firstImageUrl(html),
          };
        });
      setPreviewEntries(entries);
    } catch {
      /* 预览失败不阻断订阅 */
    } finally {
      setLookupBusy(false);
    }
  }

  const categoryOptions = createMemo(() => {
    const list = categories() ?? [];
    const current = category();
    const set = new Set<string>([UNCATEGORIZED, ...list]);
    if (current.trim()) set.add(current.trim());
    return [...set].sort((a, b) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b, 'zh-CN');
    });
  });

  const subCountLabel = () => {
    const n = subscriptionCount();
    const formatted = formatFoloHeatCount(n);
    return formatted ? `${formatted} 订阅者` : '';
  };

  const weekLabel = () => {
    const n = updatesPerWeek();
    const formatted = formatFoloHeatCount(n);
    return formatted ? `${formatted} 条目/周` : '';
  };

  function fillDefaultTitle() {
    setTitle(displayDefaultTitle());
  }

  async function handleSubmit() {
    const d = draft();
    if (!d || busy()) return;
    setBusy(true);
    try {
      const nextView = defaultSubscribeFeedViewForWrite(view());
      if (d.mode === 'edit') {
        const sourceId = d.sourceId?.trim();
        if (!sourceId) throw new Error('缺少订阅源 ID');
        await updateSubscribeSource(sourceId, {
          title: title().trim() || displayDefaultTitle(),
          category: category().trim(),
          view: nextView,
        });
        props.onOpenChange(false);
        props.onUpdated?.(sourceId);
        showAppToast({ title: '已保存', variant: 'success' });
        return;
      }

      const url = d.url.trim();
      if (!url) throw new Error('缺少订阅地址');
      const sourceId = await createSubscribeSource({
        title: title().trim() || displayDefaultTitle(),
        url,
        category: category().trim() || undefined,
        view: nextView,
        foloFeedId: resolvedFoloFeedId() || d.foloFeedId,
        siteUrl: resolvedSiteUrl() || d.siteUrl,
        iconUrl: resolvedIcon() || d.iconUrl,
      });
      props.onOpenChange(false);
      props.onCreated?.(sourceId);
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void refreshSubscribeSource(sourceId).then(() => props.onCreated?.(sourceId));
    } catch (error) {
      showAppToast({
        title: isEdit() ? '保存失败' : '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="sm:max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>订阅源</AppDialogTitle>
          <AppDialogDescription class="sr-only">
            {isEdit() ? '编辑订阅源标题、分类与视图' : '确认订阅并设置标题、分类与视图'}
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody class="space-y-4 py-2">
          <div class="flex gap-3">
            <SubscribeSourceLogo
              class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
              iconClass="h-5 w-5 text-muted-foreground"
              source={{
                title: displayDefaultTitle(),
                url: feedUrl(),
                siteUrl: resolvedSiteUrl(),
                iconUrl: resolvedIcon(),
              }}
              alt={displayDefaultTitle()}
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h3 class="truncate text-base font-semibold leading-tight">
                  {displayDefaultTitle()}
                </h3>
                <span class="shrink-0 rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
                  {badge()}
                </span>
              </div>
              <p class="truncate text-xs text-muted-foreground">{feedUrl()}</p>
              <Show when={resolvedDescription()}>
                <p class="line-clamp-2 text-xs text-muted-foreground">
                  {resolvedDescription()}
                </p>
              </Show>
              <div class="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-muted-foreground">
                <Show when={subCountLabel()}>
                  <span class="inline-flex items-center gap-1">
                    <AuthorIcon class="h-3.5 w-3.5" />
                    {subCountLabel()}
                  </span>
                </Show>
                <Show when={weekLabel()}>
                  <span class="inline-flex items-center gap-1">{weekLabel()}</span>
                </Show>
                <Show when={lookupBusy() && !previewEntries().length}>
                  <span>加载预览…</span>
                </Show>
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <div>
              <div class="text-sm font-medium">标题</div>
              <p class="text-xs text-muted-foreground">
                此订阅源的自定义标题，留空则使用默认标题。
              </p>
            </div>
            <div class="flex gap-2">
              <AppTextFieldInput
                layout="bare"
                class="min-w-0 flex-1"
                placeholder={displayDefaultTitle()}
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
              />
              <Button
                type="button"
                variant="outline"
                class="shrink-0"
                disabled={title() === displayDefaultTitle()}
                onClick={fillDefaultTitle}
              >
                填充
              </Button>
            </div>
          </div>

          <div class="space-y-1.5">
            <div>
              <div class="text-sm font-medium">分类</div>
              <p class="text-xs text-muted-foreground">
                默认情况下，你的订阅将按网站域名分组。
              </p>
            </div>
            <AppSelect
              options={categoryOptions()}
              value={category()}
              onChange={(next) => {
                if (next != null) setCategory(next);
              }}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {categoryLabel(String(itemProps.item.rawValue ?? ''))}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger layout="compact" class="w-full" aria-label="分类">
                <AppSelectValue>
                  {(state) => categoryLabel(String(state.selectedOption() ?? ''))}
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
          </div>

          <div class="space-y-1.5">
            <div>
              <div class="text-sm font-medium">视图</div>
              <p class="text-xs text-muted-foreground">
                决定该源在首页列表中的展示风格。
              </p>
            </div>
            <div class="overflow-hidden rounded-xl border">
              <div class="flex flex-wrap justify-around gap-1 border-b px-1 py-2">
                <For each={SUBSCRIBE_FEED_VIEW_STORED}>
                  {(kind) => {
                    const Icon = VIEW_ICON[kind];
                    const active = () => view() === kind;
                    return (
                      <button
                        type="button"
                        class={cn(
                          'inline-flex min-w-18 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                          active()
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => setView(kind)}
                      >
                        <Icon
                          class={cn(
                            'h-4 w-4',
                            active() ? 'text-emerald-600 dark:text-emerald-400' : undefined,
                          )}
                        />
                        <span class={cn(active() && 'font-medium')}>
                          {SUBSCRIBE_FEED_VIEW_LABELS[kind]}
                        </span>
                        <span
                          class={cn(
                            'mt-0.5 h-0.5 w-8 rounded-full',
                            active() ? 'bg-emerald-500' : 'bg-transparent',
                          )}
                        />
                      </button>
                    );
                  }}
                </For>
              </div>
              <Show
                when={previewEntries().length > 0}
                fallback={
                  <div class="px-3 py-6 text-center text-xs text-muted-foreground">
                    {lookupBusy() ? '正在加载条目预览…' : '暂无条目预览'}
                  </div>
                }
              >
                <ViewPreviewList
                  view={view()}
                  entries={previewEntries()}
                  sourceTitle={displayDefaultTitle()}
                  sourceUrl={feedUrl()}
                  siteUrl={resolvedSiteUrl()}
                  iconUrl={resolvedIcon()}
                />
              </Show>
            </div>
          </div>
        </AppDialogScrollBody>

        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy() || !feedUrl()}>
            {busy() ? (isEdit() ? '保存中…' : '订阅中…') : isEdit() ? '保存' : '订阅'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
