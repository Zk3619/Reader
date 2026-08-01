/**
 * 添加订阅源弹窗：侧栏快速添加与管理页共用
 */

import { createMemo, createResource, createSignal, createEffect, on } from 'solid-js';
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
import { showAppToast } from '@/components/shared/AppToasts';
import {
  createSubscribeSource,
  listSubscribeCategories,
  refreshSubscribeSource,
} from '@/lib/subscribe/service';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  SUBSCRIBE_FEED_VIEW_STORED,
  defaultSubscribeFeedViewForWrite,
  subscribeFeedViewNumberToKind,
  type SubscribeFeedViewStored,
} from '@/lib/subscribe/feed-view';
import { getSubscribeHubState } from '@/stores/subscribe-hub/section';

const UNCATEGORIZED = '';

function categoryLabel(value: string) {
  return value.trim() ? value : '未分类';
}

export interface SubscribeSourceAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建成功后回调（如管理页刷新列表）；侧栏可省略，依赖 revision bump */
  onCreated?: (sourceId: string) => void;
}

export function SubscribeSourceAddDialog(props: SubscribeSourceAddDialogProps) {
  const hubState = getSubscribeHubState();
  const [categories, { refetch: refetchCategories }] = createResource(() =>
    listSubscribeCategories(),
  );
  const [title, setTitle] = createSignal('');
  const [url, setUrl] = createSignal('');
  const [category, setCategory] = createSignal(UNCATEGORIZED);
  const [view, setView] = createSignal<SubscribeFeedViewStored>(
    subscribeFeedViewNumberToKind(defaultSubscribeFeedViewForWrite(hubState.feedView)),
  );
  const [busy, setBusy] = createSignal(false);

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setTitle('');
        setUrl('');
        setCategory(UNCATEGORIZED);
        setView(
          subscribeFeedViewNumberToKind(defaultSubscribeFeedViewForWrite(hubState.feedView)),
        );
        void refetchCategories();
      },
    ),
  );

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

  async function handleSubmit() {
    const feedUrl = url().trim();
    if (!feedUrl || busy()) return;
    setBusy(true);
    try {
      const id = await createSubscribeSource({
        title: title().trim() || feedUrl,
        url: feedUrl,
        type: 'rss',
        category: category().trim(),
        view: defaultSubscribeFeedViewForWrite(view()),
      });
      props.onOpenChange(false);
      props.onCreated?.(id);
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void refreshSubscribeSource(id).then(() => props.onCreated?.(id));
    } catch (error) {
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="sm:max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>添加订阅源</AppDialogTitle>
          <AppDialogDescription>
            支持 RSS / Atom。数据写入独立 `sub_*` 表，不影响阅读模块 legado RSS。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class="space-y-3 py-2">
          <AppTextFieldInput
            layout="bare"
            placeholder="标题（可选）"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          <AppTextFieldInput
            layout="bare"
            placeholder="https://example.com/feed.xml"
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
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
          <AppSelect
            options={SUBSCRIBE_FEED_VIEW_STORED}
            value={view()}
            onChange={(next) => {
              if (next) setView(next);
            }}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {SUBSCRIBE_FEED_VIEW_LABELS[itemProps.item.rawValue]}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="compact" class="w-full" aria-label="类型">
              <AppSelectValue>
                {(state) =>
                  SUBSCRIBE_FEED_VIEW_LABELS[
                    state.selectedOption() as SubscribeFeedViewStored
                  ] || '文章'
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!url().trim() || busy()}
          >
            添加并刷新
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
