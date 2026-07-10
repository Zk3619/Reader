/**
 * Hub 专辑浏览
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
} from '@/lib/media/audio/music-sdk';
import { fetchAlbumDetail, type AlbumDetail } from '@/lib/media/audio/music-sdk/album';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';

export const MusicAlbumPane: Component = () => {
  const [source, setSource] = createSignal<MusicSdkSource>('wy');
  const [albumId, setAlbumId] = createSignal('');
  const [detail, setDetail] = createSignal<AlbumDetail | null>(null);
  const [loading, setLoading] = createSignal(false);

  const load = async () => {
    const id = albumId().trim();
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchAlbumDetail(source() as AudioTrackSource, id);
      setDetail(d);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-2 border-b p-4">
        <select
          class="rounded-md border bg-background px-2 py-1.5 text-sm"
          value={source()}
          onChange={(e) => setSource(e.currentTarget.value as MusicSdkSource)}
        >
          <For each={MUSIC_SDK_SOURCES}>
            {(s) => <option value={s}>{MUSIC_SDK_SOURCE_LABELS[s]}</option>}
          </For>
        </select>
        <div class="flex gap-2">
          <input
            class="flex-1 rounded-md border px-3 py-1.5 text-sm"
            placeholder="专辑 ID"
            value={albumId()}
            onInput={(e) => setAlbumId(e.currentTarget.value)}
          />
          <Button size="sm" onClick={() => void load()}>
            加载
          </Button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
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
                      <button
                        type="button"
                        class="w-full rounded px-2 py-1 text-left hover:bg-muted"
                        onClick={() => void playPlaylist(d().tracks, i())}
                      >
                        {t.name} — {t.artist}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};
