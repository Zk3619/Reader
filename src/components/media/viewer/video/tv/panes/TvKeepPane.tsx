import { Show, createMemo, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvHubToolbarIconButton } from '@/components/media/viewer/video/tv/hub/TvHubToolbarIconButton';
import {
  TvVodVirtualList,
  type TvVodListItem,
} from '@/components/media/viewer/video/tv/cards/TvVodVirtualList';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { TrashIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { loadTvDetail } from '@/stores/tv-hub/detail';
import {
  bootstrapTvLive,
  getTvLiveState,
  playLiveChannel,
} from '@/stores/tv-hub/live';

async function openKeepItem(item: Awaited<ReturnType<typeof TvDao.listKeep>>[number]) {
  if (item.kind === 'live') {
    await bootstrapTvLive(item.siteKey);
    const ch = getTvLiveState().channels.find(
      (c) => c.name === item.vodName || c.name === item.vodId,
    );
    if (ch) {
      playLiveChannel({ channel: ch });
      return;
    }
  }
  await loadTvDetail(item.siteKey, item.vodId);
}

export function TvKeepPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listKeep(),
  );

  const listItems = createMemo((): TvVodListItem[] =>
    (list() ?? []).map((item) => ({
      key: item.key,
      title: item.kind === 'live' ? `[直播] ${item.vodName}` : item.vodName,
      coverUrl: item.vodPic?.trim() || undefined,
      onOpen: () => void openKeepItem(item),
      trailing: (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          class="h-7 px-2 text-xs shadow-sm"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            void TvDao.removeKeep(item.key).then(() => setTick((n) => n + 1));
          }}
        >
          ×
        </Button>
      ),
    })),
  );

  const showList = () => !list.loading && (list()?.length ?? 0) > 0;

  return (
    <TvHubPageShell
      section="keep"
      scrollClass={showList() ? 'overflow-hidden' : undefined}
      toolbar={
        <TvHubToolbarIconButton
          label="清空收藏"
          onClick={() => {
            void TvDao.clearKeep().then(() => setTick((n) => n + 1));
          }}
        >
          <TrashIcon class="h-4 w-4" />
        </TvHubToolbarIconButton>
      }
    >
      <Show when={list.loading}>
        <p class={cn('py-3 text-sm text-muted-foreground', tvHubPageContentInsetClass)}>
          加载中…
        </p>
      </Show>
      <Show when={showList()}>
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TvVodVirtualList class="min-h-0 flex-1 my-2" items={listItems} />
        </div>
      </Show>
    </TvHubPageShell>
  );
}
