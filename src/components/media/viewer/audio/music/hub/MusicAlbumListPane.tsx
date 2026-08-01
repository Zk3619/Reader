/**
 * Hub 专辑发现页（对齐歌单：分区内列表 ↔ 详情；滚动/分页可配置）
 */

import { For, Show, createEffect, createMemo, createSignal, onMount, type Component } from 'solid-js';
import { Disc3 } from 'lucide-solid';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import { MusicDiscoverPagination } from '@/components/media/viewer/audio/music/hub/MusicDiscoverPagination';
import { MusicHubQuickScroll } from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll';
import {
  DISCOVER_LIST_SOURCES,
  MusicDiscoverListToolbar,
} from '@/components/media/viewer/audio/music/hub/MusicDiscoverListToolbar';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import {
  filterPlaylistsByMusicQuery,
  getMusicQueryPrefs,
} from '@/lib/media/audio/music-query-prefs';
import {
  albumListPageCount,
  ensureAlbumListLoaded,
  getMusicAlbumListState,
  goToAlbumListPage,
  loadMoreAlbumList,
  refreshAlbumList,
  setAlbumListSource,
} from '@/stores/music-hub/discover-lists';
import { openAlbumBrowse } from '@/stores/music-hub/browse';
import { getMusicDiscoverUi } from '@/stores/music-hub/music-discover-ui';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { type HubBrowseSource } from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
  bookGroupGridMetaClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
  formatBookshelfGridAuthor,
} from '@/lib/bookshelf/book-group-card-styles';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

const ALBUM_DISCOVER_SOURCES = DISCOVER_LIST_SOURCES;

export const MusicAlbumListPane: Component = () => {
  const state = getMusicAlbumListState;
  const ui = getMusicDiscoverUi;
  const [filterKeyword, setFilterKeyword] = createSignal('');
  const [listScrollEl, setListScrollEl] = createSignal<HTMLDivElement | undefined>();
  let lastScrollTop = 0;

  const filteredAlbums = createMemo(() => {
    void getMusicQueryPrefs().mode;
    void getMusicQueryPrefs().scopes.join(',');
    const albums = state().albums;
    const kw = filterKeyword().trim();
    if (!kw) return albums;
    return filterPlaylistsByMusicQuery(
      albums.map((album) => ({ ...album, creator: album.artist })),
      kw,
    );
  });

  onMount(() => {
    if (!ALBUM_DISCOVER_SOURCES.includes(state().source as HubBrowseSource)) {
      void setAlbumListSource('wy');
    } else {
      void ensureAlbumListLoaded();
    }
  });

  createEffect(() => {
    const page = state().page;
    if (ui().albumPaginationPreference !== 'pagination') return;
    const el = listScrollEl();
    if (!el) return;
    void page;
    const reduceMotion = settingsStore.state.app.reduceMotion;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion });
    });
  });

  const handleScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastScrollTop;
    lastScrollTop = top;
    if (ui().albumPaginationPreference !== 'scroll') return;
    if (!moved || state().loadingMore || !state().hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) void loadMoreAlbumList();
  };

  const pageCount = () => albumListPageCount();

  return (
      <MusicHubPageShell
        section="album"
        scrollClass="overflow-hidden"
        toolbar={
          <MusicDiscoverListToolbar
            kind="album"
            source={state().source}
            onSourceChange={(source) => void setAlbumListSource(source as AudioTrackSource)}
            onPaginationModeChange={() => void refreshAlbumList()}
            filterKeyword={filterKeyword()}
            onFilterKeywordChange={setFilterKeyword}
          />
        }
        title="专辑"
        description="新碟与热门专辑（网易云 / 酷狗）"
      >
        <div class={cn('relative flex min-h-0 flex-1 flex-col gap-2 py-2', musicHubPageContentInsetClass)}>
          <Show when={state().error}>
            <p class="px-2 text-sm text-destructive">{state().error}</p>
          </Show>
          <Show when={state().loading && state().albums.length === 0}>
            <p class="py-12 text-center text-sm text-muted-foreground">加载中…</p>
          </Show>
          <div
            ref={setListScrollEl}
            class="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2"
            onScroll={(e) => handleScroll(e.currentTarget)}
          >
            <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              <For each={filteredAlbums()}>
                {(item) => (
                  <li class="min-w-0 list-none">
                    <button
                      type="button"
                      class={bookGroupGridCardClass(
                        'h-full w-full min-w-0 cursor-pointer overflow-hidden text-left',
                      )}
                      onClick={() =>
                        void openAlbumBrowse(item.source, item.id, {
                          name: item.name,
                          artist: item.artist,
                          coverUrl: item.coverUrl,
                        })
                      }
                      {...bookGroupCardPressHandlers}
                    >
                      <div class={bookGroupGridCoverClass('aspect-square')}>
                        <div class={bookGroupGridCoverZoomClass()}>
                          <Show
                            when={item.coverUrl}
                            fallback={
                              <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                                <Disc3 class="h-8 w-8 opacity-40" />
                              </div>
                            }
                          >
                            <MusicCoverImg
                              src={item.coverUrl}
                              alt={item.name}
                              class="h-full w-full object-cover"
                              loading="lazy"
                              draggable={false}
                              fallback={
                                <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Disc3 class="h-8 w-8 opacity-40" />
                                </div>
                              }
                            />
                          </Show>
                        </div>
                      </div>
                      <div class={bookGroupGridMetaClass()}>
                        <h3 class={bookGroupGridTitleClass()}>{item.name}</h3>
                        <p class={bookGroupGridSubtitleClass()}>
                          {formatBookshelfGridAuthor(item.artist)}
                        </p>
                      </div>
                    </button>
                  </li>
                )}
              </For>
            </ul>

            <Show when={ui().albumPaginationPreference === 'scroll' && state().albums.length > 0}>
              <Show when={state().loadingMore}>
                <div class="py-4 text-center text-sm text-muted-foreground">加载中…</div>
              </Show>
              <Show when={!state().loadingMore && !state().hasMore}>
                <div class="py-4 text-center text-sm text-muted-foreground">没有更多了</div>
              </Show>
            </Show>

            <Show
              when={
                ui().albumPaginationPreference === 'pagination' &&
                pageCount() > 1 &&
                state().albums.length > 0
              }
            >
              <MusicDiscoverPagination
                count={pageCount()}
                page={state().page}
                totalKnown={state().totalKnown}
                onPageChange={(page) => void goToAlbumListPage(page)}
                disabled={state().loading || state().loadingMore}
              />
            </Show>

            <Show when={!state().loading && state().albums.length === 0 && !state().error}>
              <p class="py-12 text-center text-sm text-muted-foreground">暂无专辑</p>
            </Show>
            <Show
              when={
                !state().loading &&
                state().albums.length > 0 &&
                filteredAlbums().length === 0 &&
                !!filterKeyword().trim()
              }
            >
              <p class="py-12 text-center text-sm text-muted-foreground">无匹配专辑</p>
            </Show>
          </div>
          <MusicHubQuickScroll
            container={listScrollEl}
            contentRevision={() =>
              `${state().albums.length}:${filteredAlbums().length}:${filterKeyword()}:${getMusicQueryPrefs().mode}:${state().page}:${ui().albumPaginationPreference}:${state().source}`
            }
          />
        </div>
      </MusicHubPageShell>
  );
};
