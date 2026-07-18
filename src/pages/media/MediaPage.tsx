/**
 * 媒体页：顶栏 Tab 切换 文本 / 图片 / 音频 / 视频
 */

import { createEffect, Match, Show, Switch, type Accessor } from 'solid-js';
import type { MediaKind } from '@/lib/book-source/book-type';
import type { MediaShelfPageProps } from '@/pages/media-shelf/MediaShelfPage';
import { MediaShelfShell } from '@/pages/media/MediaShelfShell';
import { AppTabs } from '@/components/shared/AppTabs';
import { MusicHubShell } from '@/components/viewer/audio/music/hub/MusicHubShell';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import {
  mediaKindTabValue,
  setMediaKindTab,
  setAudioMediaSubTab,
  audioMediaSubTabValue,
  type MediaKindTab,
} from '@/stores/shell-tabs';
import { viewerStore } from '@/stores/viewer';
import { setMusicSection } from '@/stores/viewer/media/audio';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

const MEDIA_TABS: MediaKindTab[] = ['text', 'image', 'audio', 'video'];

const MEDIA_TAB_LABELS: Partial<Record<MediaKindTab, string>> & Record<'text' | 'image' | 'audio' | 'video', string> = {
  text: '文本',
  image: '图片',
  audio: '音频',
  video: '视频',
};

export type MediaPageProps = MediaShelfPageProps & {
  active?: boolean | Accessor<boolean>;
  musicSection?: import('@/stores/viewer/base-state').MusicHubSection;
};

export function MediaPage(props: MediaPageProps) {
  const isActive = () => readShellPageActive(props.active);
  const mediaTab = () => mediaKindTabValue();
  const audioSubTab = () => audioMediaSubTabValue();

  createEffect(() => {
    if (!isActive()) return;
    if (mediaTab() === 'audio' && audioSubTab() === 'music') {
      // 显式 section 才覆盖；否则走 openMusicHub 内持久化分区恢复
      void viewerStore.openMusicHub(
        props.musicSection ? { section: props.musicSection } : undefined,
      );
    }
  });

  createEffect(() => {
    if (props.musicSection) {
      setMusicSection(props.musicSection);
    }
  });

  const shelfProps = () => ({
    active: isActive(),
    onGroupsLoaded: props.onGroupsLoaded,
    onGroupCountsLoaded: props.onGroupCountsLoaded,
    onOpenBook: props.onOpenBook,
    onPageChange: props.onPageChange,
    onOpenGroupManage: props.onOpenGroupManage,
    onOpenBookshelfManage: props.onOpenBookshelfManage,
    onImportLocal: props.onImportLocal,
    onAddBookByUrl: props.onAddBookByUrl,
    onOpenBookshelfCache: props.onOpenBookshelfCache,
    onOpenBookSearch: props.onOpenBookSearch,
    onOpenBookInfo: props.onOpenBookInfo,
  });

  return (
    <div class={cn(mainShellPageRoot, 'flex flex-col flex-1 min-h-0')}>
      <div class="shrink-0 border-b px-4 py-2">
        <AppTabs
          value={mediaTab()}
          onChange={(v) => setMediaKindTab(v as MediaKindTab)}
          ariaLabel="媒体类型"
          variant="settings-equal"
          options={MEDIA_TABS}
          labels={MEDIA_TAB_LABELS}
        />
      </div>

      <Switch>
        <Match when={mediaTab() === 'text'}>
          <MediaShelfShell
            {...shelfProps()}
            mediaKind={'text' satisfies MediaKind}
            scope="text"
          />
        </Match>
        <Match when={mediaTab() === 'audio'}>
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="border-b px-4 py-2">
              <AppTabs
                value={audioSubTab()}
                onChange={(v) => setAudioMediaSubTab(v as 'audiobook' | 'music')}
                ariaLabel="音频子类型"
                variant="drawer-inline"
                options={['audiobook', 'music'] as const}
                labels={{ audiobook: '听书', music: '音乐' }}
              />
            </div>
            <Show
              when={audioSubTab() === 'music'}
              fallback={
                <MediaShelfShell
                  {...shelfProps()}
                  mediaKind={'audio' satisfies MediaKind}
                  scope="audiobook"
                />
              }
            >
              {/* 媒体页隐藏时不挂载 Hub，避免预拉网易云热搜等 */}
              <Show when={isActive()}>
                <MusicHubShell active={isActive} />
              </Show>
            </Show>
          </div>
        </Match>
        <Match when={mediaTab() === 'image'}>
          <MediaShelfShell
            {...shelfProps()}
            mediaKind={'image' satisfies MediaKind}
            scope="image"
          />
        </Match>
        <Match when={mediaTab() === 'video'}>
          <MediaShelfShell
            {...shelfProps()}
            mediaKind={'video' satisfies MediaKind}
            scope="video"
          />
        </Match>
      </Switch>
    </div>
  );
}
