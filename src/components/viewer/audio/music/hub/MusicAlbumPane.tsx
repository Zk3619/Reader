/**
 * Hub 专辑浏览（支持分页 hasMore）
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
} from '@/lib/media/audio/music-sdk';
import { fetchAlbumDetail, type AlbumDetail } from '@/lib/media/audio/music-sdk/album';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';

export const MusicAlbumPane: Component = () => {
  const [source, setSource] = createSignal<MusicSdkSource>('wy');
  const [albumId, setAlbumId] = createSignal('');
  const [detail, setDetail] = createSignal<AlbumDetail | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const load = async () => {
    const id = albumId().trim();
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchAlbumDetail(source() as AudioTrackSource, id, 1);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    const d = detail();
    const id = albumId().trim();
    if (!d?.hasMore || !id || loadingMore()) return;
    setLoadingMore(true);
    try {
      const next = await fetchAlbumDetail(
        source() as AudioTrackSource,
        id,
        (d.page ?? 1) + 1,
      );
      if (!next) return;
      setDetail({
        ...next,
        tracks: [...d.tracks, ...next.tracks],
      });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <MusicHubPageShell
      section="album"
      below={
        <div class="space-y-2 px-4 pb-2">
          <MusicAppSelect
            value={source()}
            onChange={(v) => setSource(v as MusicSdkSource)}
            options={MUSIC_SDK_SOURCES}
            optionLabel={(v) => MUSIC_SDK_SOURCE_LABELS[v as MusicSdkSource]}
            aria-label="音乐源"
          />
          <div class="flex gap-2">
            <AppTextFieldBareInput
              fieldClass="flex-1"
              class="min-w-0"
              placeholder="专辑 ID"
              value={albumId()}
              onInput={(e) => setAlbumId(e.currentTarget.value)}
            />
            <Button size="sm" onClick={() => void load()}>
              加载
            </Button>
          </div>
        </div>
      }
    >
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
        <Show when={loading()}>
          <p class="text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={detail()}>
          {(d) => (
            <div class="space-y-3">
              <div class="flex gap-3">
                <Show when={d().coverUrl}>
                  <img src={d().coverUrl} alt="" class="h-24 w-24 rounded object-cover" />
                </Show>
                <div>
                  <p class="font-medium">{d().name}</p>
                  <p class="text-sm text-muted-foreground">{d().artist}</p>
                  <Button
                    size="sm"
                    class="mt-2"
                    onClick={() => void playPlaylist(d().tracks, 0)}
                  >
                    播放全部
                  </Button>
                </div>
              </div>
              <ul class="space-y-1 text-sm">
                <For each={d().tracks}>
                  {(t, i) => (
                    <li>
                      <Button
                        type="button"
                        variant="ghost"
                        class="h-auto w-full justify-start rounded px-2 py-1 font-normal hover:bg-muted"
                        onClick={() => void playPlaylist(d().tracks, i())}
                      >
                        {t.name}
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={d().hasMore}>
                <Button
                  size="sm"
                  variant="ghost"
                  class="w-full"
                  disabled={loadingMore()}
                  onClick={() => void loadMore()}
                >
                  {loadingMore() ? '加载中…' : '加载更多'}
                </Button>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </MusicHubPageShell>
  );
};
