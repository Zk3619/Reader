/**
 * 订阅源共用右键菜单（侧栏 / 管理页）
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  type Component,
  type JSX,
} from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuSub,
  AppContextMenuSubContent,
  AppContextMenuSubTrigger,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  CircleCheckIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  GlobeIcon,
  ImageIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MicIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
  type IconProps,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  SubscribeSourceFormDialog,
  draftFromSubSource,
  type SubscribeSourceFormDraft,
} from '@/components/media/subscribe/SubscribeSourceFormDialog';
import { cn } from '@/lib/utils';
import type { SubSourceRow } from '@/lib/database/subscribe';
import {
  listSubscribeCategories,
  markSubscribeTimelineRead,
  removeSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_STORED,
  defaultSubscribeFeedViewForWrite,
  subscribeFeedViewNumberToKind,
  type SubscribeFeedViewStored,
} from '@/lib/subscribe/feed-view';
import { parseSubscribeSourceMeta } from '@/lib/subscribe/presentation';
import { openUrlInBrowser } from '@/lib/platform/open-url';

const UNCATEGORIZED = '';

const VIEW_MENU_ICON: Record<SubscribeFeedViewStored, Component<IconProps>> = {
  articles: FileTextIcon,
  'social-media': MessageCircleIcon,
  pictures: ImageIcon,
  videos: PlayIcon,
  audios: MicIcon,
  notifications: MegaphoneIcon,
};

function categoryLabel(value: string) {
  return value.trim() ? value : '未分类';
}

function resolveSiteUrl(source: SubSourceRow): string | null {
  const meta = parseSubscribeSourceMeta(source.metaJson);
  const site = meta.siteUrl?.trim();
  if (site) return site;
  try {
    const u = source.url.trim();
    if (/^https?:\/\//i.test(u)) return new URL(u).origin;
  } catch {
    /* ignore */
  }
  return null;
}

export interface SubscribeSourceContextMenuProps {
  source: SubSourceRow;
  /** 传入则使用外部分类列表，否则自行加载 */
  categories?: string[];
  class?: string;
  children: JSX.Element;
  /** 数据变更后回调（刷新列表等） */
  onChanged?: () => void;
  /**
   * 自定义编辑；不传则打开内置 SubscribeSourceFormDialog。
   * 管理页可传入以复用页面已有弹窗。
   */
  onEdit?: (source: SubSourceRow) => void;
}

export const SubscribeSourceContextMenu: Component<SubscribeSourceContextMenuProps> = (props) => {
  const [editOpen, setEditOpen] = createSignal(false);
  const [editDraft, setEditDraft] = createSignal<SubscribeSourceFormDraft | null>(null);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createMode, setCreateMode] = createSignal<'move' | 'join'>('move');
  const [createName, setCreateName] = createSignal('');
  const [createBusy, setCreateBusy] = createSignal(false);
  const [loadedCategories] = createResource(
    () => props.categories == null,
    async (need) => (need ? listSubscribeCategories() : []),
  );

  const categoryOptions = createMemo(() => {
    const fromProp = props.categories;
    const list = fromProp ?? loadedCategories() ?? [];
    const current = props.source.category?.trim() || UNCATEGORIZED;
    const set = new Set<string>([UNCATEGORIZED, ...list]);
    if (current) set.add(current);
    return [...set].sort((a, b) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b, 'zh-CN');
    });
  });

  /** 加入分类：不含「未分类」 */
  const joinCategoryOptions = createMemo(() =>
    categoryOptions().filter((c) => c.trim().length > 0),
  );

  const currentView = createMemo(() => subscribeFeedViewNumberToKind(props.source.view));
  const otherViews = createMemo(() =>
    SUBSCRIBE_FEED_VIEW_STORED.filter((kind) => kind !== currentView()),
  );

  function notifyChanged() {
    props.onChanged?.();
  }

  function openEdit() {
    if (props.onEdit) {
      props.onEdit(props.source);
      return;
    }
    setEditDraft(draftFromSubSource(props.source));
    setEditOpen(true);
  }

  async function markAllRead() {
    try {
      await markSubscribeTimelineRead(props.source.id, true);
      showAppToast({ title: '已全部标记为已读', variant: 'success' });
      notifyChanged();
    } catch (error) {
      showAppToast({
        title: '标记失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  async function unsubscribe() {
    const name = props.source.title || props.source.url;
    if (!window.confirm(`确定取消订阅「${name}」吗？本地条目也会被删除。`)) return;
    try {
      await removeSubscribeSource(props.source.id);
      showAppToast({ title: '已取消订阅', variant: 'success' });
      notifyChanged();
    } catch (error) {
      showAppToast({
        title: '取消订阅失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  async function assignCategory(category: string, kind: 'move' | 'join') {
    try {
      await updateSubscribeSource(props.source.id, { category: category.trim() });
      showAppToast({
        title: kind === 'join' ? '已加入分类' : '已移动分类',
        description: categoryLabel(category),
        variant: 'success',
      });
      notifyChanged();
    } catch (error) {
      showAppToast({
        title: kind === 'join' ? '加入失败' : '移动失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  function openCreateCategory(mode: 'move' | 'join') {
    setCreateMode(mode);
    setCreateName('');
    setCreateOpen(true);
  }

  async function submitCreateCategory() {
    const name = createName().trim();
    if (!name) {
      showAppToast({ title: '分类名不能为空', variant: 'error' });
      return;
    }
    setCreateBusy(true);
    try {
      await assignCategory(name, createMode());
      setCreateOpen(false);
      setCreateName('');
    } finally {
      setCreateBusy(false);
    }
  }

  async function changeView(kind: SubscribeFeedViewStored) {
    try {
      await updateSubscribeSource(props.source.id, {
        view: defaultSubscribeFeedViewForWrite(kind),
      });
      showAppToast({
        title: '已更改视图',
        description: SUBSCRIBE_FEED_VIEW_LABELS[kind],
        variant: 'success',
      });
      notifyChanged();
    } catch (error) {
      showAppToast({
        title: '更改视图失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  async function openFeedUrl() {
    const url = props.source.url.trim();
    if (!url) {
      showAppToast({ title: '无订阅地址', variant: 'error' });
      return;
    }
    try {
      await openUrlInBrowser(url);
    } catch (error) {
      showAppToast({
        title: '打开失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  async function openSiteUrl() {
    const site = resolveSiteUrl(props.source);
    if (!site) {
      showAppToast({ title: '无网站地址', variant: 'error' });
      return;
    }
    try {
      await openUrlInBrowser(site);
    } catch (error) {
      showAppToast({
        title: '打开失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(props.source.id);
      showAppToast({ title: '已复制 ID', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: '复制失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  }

  return (
    <>
      <AppContextMenu>
        <AppContextMenuTrigger as="div" class={cn('h-full w-full min-w-0', props.class)}>
          {props.children}
        </AppContextMenuTrigger>
        <AppContextMenuContent layout="compact" class="min-w-52">
          <AppContextMenuItem onSelect={() => void markAllRead()}>
            <CircleCheckIcon class="mr-2 h-4 w-4" />
            全部标记为已读
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={openEdit}>
            <PencilIcon class="mr-2 h-4 w-4" />
            编辑
          </AppContextMenuItem>
          <AppContextMenuItem
            class="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => void unsubscribe()}
          >
            <TrashIcon class="mr-2 h-4 w-4" />
            取消订阅
          </AppContextMenuItem>

          <AppContextMenuSeparator />

          <AppContextMenuSub>
            <AppContextMenuSubTrigger>
              <FolderIcon class="mr-2 h-4 w-4" />
              移动至分类
            </AppContextMenuSubTrigger>
            <AppContextMenuSubContent>
              <For each={categoryOptions()}>
                {(category) => {
                  const active = () =>
                    (props.source.category?.trim() || UNCATEGORIZED) === category;
                  return (
                    <AppContextMenuItem
                      disabled={active()}
                      onSelect={() => void assignCategory(category, 'move')}
                    >
                      {categoryLabel(category)}
                      <Show when={active()}>
                        <span class="ml-auto text-xs text-muted-foreground">当前</span>
                      </Show>
                    </AppContextMenuItem>
                  );
                }}
              </For>
              <AppContextMenuSeparator />
              <AppContextMenuItem onSelect={() => openCreateCategory('move')}>
                <FolderPlusIcon class="mr-2 h-4 w-4" />
                创建分类…
              </AppContextMenuItem>
            </AppContextMenuSubContent>
          </AppContextMenuSub>

          <AppContextMenuSub>
            <AppContextMenuSubTrigger>
              <FolderPlusIcon class="mr-2 h-4 w-4" />
              加入到分类
            </AppContextMenuSubTrigger>
            <AppContextMenuSubContent>
              <Show
                when={joinCategoryOptions().length > 0}
                fallback={
                  <AppContextMenuItem disabled>暂无分类</AppContextMenuItem>
                }
              >
                <For each={joinCategoryOptions()}>
                  {(category) => {
                    const active = () =>
                      (props.source.category?.trim() || '') === category;
                    return (
                      <AppContextMenuItem
                        disabled={active()}
                        onSelect={() => void assignCategory(category, 'join')}
                      >
                        {category}
                        <Show when={active()}>
                          <span class="ml-auto text-xs text-muted-foreground">当前</span>
                        </Show>
                      </AppContextMenuItem>
                    );
                  }}
                </For>
              </Show>
              <AppContextMenuSeparator />
              <AppContextMenuItem onSelect={() => openCreateCategory('join')}>
                <FolderPlusIcon class="mr-2 h-4 w-4" />
                创建分类…
              </AppContextMenuItem>
            </AppContextMenuSubContent>
          </AppContextMenuSub>

          <AppContextMenuSeparator />

          <AppContextMenuItem onSelect={() => void openFeedUrl()}>
            <GlobeIcon class="mr-2 h-4 w-4" />
            在浏览器打开订阅源
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => void openSiteUrl()}>
            <GlobeIcon class="mr-2 h-4 w-4" />
            在浏览器打开网站
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => void copyId()}>
            <CopyIcon class="mr-2 h-4 w-4" />
            复制 ID
          </AppContextMenuItem>

          <AppContextMenuSeparator />

          <AppContextMenuSub>
            <AppContextMenuSubTrigger
              class={cn(
                'text-orange-600 focus:bg-orange-500/10 focus:text-orange-700',
                'data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-700',
                'dark:text-orange-400 dark:focus:text-orange-300 dark:data-[state=open]:text-orange-300',
              )}
            >
              更改为其他视图
            </AppContextMenuSubTrigger>
            <AppContextMenuSubContent>
              <For each={otherViews()}>
                {(kind) => {
                  const Icon = VIEW_MENU_ICON[kind];
                  return (
                    <AppContextMenuItem onSelect={() => void changeView(kind)}>
                      <Icon class="mr-2 h-4 w-4" />
                      {SUBSCRIBE_FEED_VIEW_LABELS[kind]}
                    </AppContextMenuItem>
                  );
                }}
              </For>
            </AppContextMenuSubContent>
          </AppContextMenuSub>
        </AppContextMenuContent>
      </AppContextMenu>

      <Show when={!props.onEdit}>
        <SubscribeSourceFormDialog
          open={editOpen()}
          draft={editDraft()}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditDraft(null);
          }}
          onUpdated={() => notifyChanged()}
        />
      </Show>

      <AppDialog open={createOpen()} onOpenChange={setCreateOpen}>
        <AppDialogContent class="sm:max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>创建分类</AppDialogTitle>
            <AppDialogDescription>
              {createMode() === 'join'
                ? '创建后将当前源加入该分类。'
                : '创建后将当前源移动到该分类。'}
            </AppDialogDescription>
          </AppDialogHeader>
          <AppTextFieldInput
            layout="bare"
            class="w-full"
            placeholder="分类名称"
            value={createName()}
            onInput={(e) => setCreateName(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') void submitCreateCategory();
            }}
          />
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={createBusy()} onClick={() => void submitCreateCategory()}>
              {createBusy() ? '保存中…' : '确定'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
};
