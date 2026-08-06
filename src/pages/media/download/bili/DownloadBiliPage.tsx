/**
 * 下载模块 · 独立哔哩页
 */

import { Show, createSignal } from 'solid-js';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
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
import { parseId } from '@/lib/download/bili/parse-id';
import { getMediaInfo } from '@/lib/download/bili/media-info';
import {
  buildDefaultSelect,
  probePopupProvider,
} from '@/lib/download/bili/select';
import { enqueueBiliItems } from '@/lib/download/bili/enqueue';
import { MEDIA_TYPE_LABEL, type MediaType } from '@/lib/download/bili/types';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  closeBiliPopup,
  getBiliHubState,
  openBiliPopup,
  setBiliEnqueueing,
  setBiliError,
  setBiliInput,
  setBiliLoading,
  setBiliMedia,
  setBiliMediaTypeHint,
  setBiliPane,
} from '@/stores/download-bili/hub';
import { BiliAccountBar } from './BiliAccountBar';
import { BiliMediaInfo } from './BiliMediaInfo';
import { BiliMediaList } from './BiliMediaList';
import { BiliSelectPopup } from './BiliSelectPopup';
import { BiliHistoryPane } from './BiliHistoryPane';

const TYPE_OPTIONS = [
  'auto',
  'video',
  'bangumi',
  'lesson',
  'music',
  'musicList',
  'watchLater',
  'favorite',
  'opus',
  'opusList',
  'userVideo',
  'userOpus',
  'userAudio',
] as const;

const TYPE_LABEL: Record<(typeof TYPE_OPTIONS)[number], string> = {
  auto: '自动识别',
  ...MEDIA_TYPE_LABEL,
};

export function DownloadBiliPage() {
  const hub = getBiliHubState();
  const [pn, setPn] = createSignal(1);

  const resolve = async (page = 1) => {
    const raw = hub.input.trim();
    if (!raw && hub.mediaTypeHint !== 'watchLater') {
      showAppToast({ title: '请输入链接或 ID', variant: 'error' });
      return;
    }
    setBiliLoading(true);
    setBiliError('');
    try {
      let id = raw;
      let type: MediaType | undefined;
      let target: number | undefined;
      if (hub.mediaTypeHint === 'watchLater' && !raw) {
        id = '';
        type = 'watchLater';
      } else if (hub.mediaTypeHint !== 'auto') {
        const parsed = await parseId(raw, true);
        id = parsed.id || raw;
        type = hub.mediaTypeHint;
        target = parsed.target;
      } else {
        const parsed = await parseId(raw);
        id = parsed.id;
        type = parsed.type;
        target = parsed.target;
      }
      if (!type) throw new Error('无法识别类型，请手动选择媒体类型');
      const info = await getMediaInfo(id, type, {
        pn: page,
        target: hub.sectionTarget ?? target,
      });
      setBiliMedia(info);
      setPn(page);
      setBiliPane('search');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBiliError(msg);
      showAppToast({ title: msg, variant: 'error' });
    } finally {
      setBiliLoading(false);
    }
  };

  const openDownload = async () => {
    const media = hub.media;
    if (!media || !hub.selected.length) {
      showAppToast({ title: '请先选择条目', variant: 'error' });
      return;
    }
    const items = hub.selected
      .map((i) => media.list[i])
      .filter(Boolean) as typeof media.list;
    setBiliLoading(true);
    try {
      const first = items[0]!;
      const provider = await probePopupProvider(first, media.nfo);
      const select = buildDefaultSelect(provider);
      openBiliPopup(items, provider, select);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : '探测画质失败',
        variant: 'error',
      });
    } finally {
      setBiliLoading(false);
    }
  };

  const confirmEnqueue = async () => {
    const media = hub.media;
    const select = hub.popupSelect;
    const items = hub.popupItems;
    if (!media || !select || !items.length) return;
    setBiliEnqueueing(true);
    try {
      const result = await enqueueBiliItems(
        items.map((item) => ({ item, nfo: media.nfo, select })),
        { seriesNfo: media.nfo },
      );
      closeBiliPopup();
      if (result.errors.length) {
        showAppToast({
          title: `完成 ${result.taskIds.length}，失败 ${result.errors.length}`,
          description: result.errors.slice(0, 3).join('\n'),
          variant: 'error',
        });
      } else {
        showAppToast({
          title: `已加入 ${result.taskIds.length} 个任务`,
          variant: 'success',
        });
      }
      if (result.taskIds.length) setDownloadSection('tasks');
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : '入队失败',
        variant: 'error',
      });
    } finally {
      setBiliEnqueueing(false);
    }
  };

  return (
    <DownloadHubPageShell
      section="bili"
      delegateScroll
      toolbar={
        <div class="flex items-center gap-1">
          <Button
            size="sm"
            variant={hub.pane === 'search' ? 'default' : 'ghost'}
            onClick={() => setBiliPane('search')}
          >
            解析
          </Button>
          <Button
            size="sm"
            variant={hub.pane === 'history' ? 'default' : 'ghost'}
            onClick={() => setBiliPane('history')}
          >
            历史
          </Button>
        </div>
      }
    >
      <div class="flex min-h-0 flex-1 flex-col gap-3 px-2 pb-4 pt-2">
        <BiliAccountBar />

        <Show when={hub.pane === 'history'}>
          <BiliHistoryPane />
        </Show>

        <Show when={hub.pane === 'search'}>
          <div class="flex w-full min-w-0 items-center gap-2">
            <AppSelect
              value={hub.mediaTypeHint}
              onChange={(v) =>
                setBiliMediaTypeHint((v as MediaType | 'auto') || 'auto')
              }
              options={[...TYPE_OPTIONS]}
              itemComponent={(itemProps) => (
                <AppSelectItem item={itemProps.item}>
                  {TYPE_LABEL[itemProps.item.rawValue as (typeof TYPE_OPTIONS)[number]]}
                </AppSelectItem>
              )}
            >
              <AppSelectTrigger class="w-[150px] shrink-0" aria-label="媒体类型">
                <AppSelectValue>
                  {(state) =>
                    TYPE_LABEL[
                      (state.selectedOption() as (typeof TYPE_OPTIONS)[number]) ||
                        'auto'
                    ]
                  }
                </AppSelectValue>
                <AppSelectIcon />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectListbox />
              </AppSelectContent>
            </AppSelect>
            <AppTextFieldBareInput
              value={hub.input}
              onInput={(e: Event & { currentTarget: HTMLInputElement }) =>
                setBiliInput(e.currentTarget.value)
              }
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void resolve(1);
              }}
              placeholder="粘贴 BV / ep / ss / au / 空间 / 收藏 / b23 / 分享文案…"
              fieldClass="min-w-0 flex-1"
              class="w-full"
            />
            <Button
              size="sm"
              class="shrink-0"
              disabled={hub.loading}
              onClick={() => void resolve(1)}
            >
              {hub.loading ? '解析中…' : '解析'}
            </Button>
            <Show when={hub.media?.pn}>
              <Button
                size="sm"
                variant="outline"
                disabled={hub.loading || pn() <= 1}
                onClick={() => void resolve(pn() - 1)}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={hub.loading}
                onClick={() => void resolve(pn() + 1)}
              >
                下一页
              </Button>
            </Show>
          </div>

          <Show when={hub.error}>
            <div class="text-sm text-destructive">{hub.error}</div>
          </Show>

          <BiliMediaInfo />
          <BiliMediaList onDownload={() => void openDownload()} />
        </Show>
      </div>

      <BiliSelectPopup onConfirm={() => void confirmEnqueue()} />
    </DownloadHubPageShell>
  );
}
