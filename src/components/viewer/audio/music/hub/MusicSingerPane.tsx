/**
 * Hub 歌手浏览（tx 正式接口；wy/kg 分页；kw/mg 需歌手名兜底）
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
} from '@/lib/media/audio/music-sdk';
import { fetchSingerDetail, type SingerDetail } from '@/lib/media/audio/music-sdk/singer';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';

export const MusicSingerPane: Component = () => {
  const [source, setSource] = createSignal<MusicSdkSource>('wy');
  const [singerId, setSingerId] = createSignal('');
  const [singerName, setSingerName] = createSignal('');
  const [detail, setDetail] = createSignal<SingerDetail | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const load = async () => {
    const id = singerId().trim();
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchSingerDetail(
        source() as AudioTrackSource,
        id,
        singerName().trim() || undefined,
        1,
      );
      setDetail(d);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    const d = detail();
    const id = singerId().trim();
    if (!d?.hasMore || !id || loadingMore()) return;
    setLoadingMore(true);
    try {
      const next = await fetchSingerDetail(
        source() as AudioTrackSource,
        id,
        singerName().trim() || undefined,
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
      section="singer"
      below={
        <div class="space-y-2 px-4 pb-2">
          <MusicAppSelect
            value={source()}
            onChange={(v) => setSource(v as MusicSdkSource)}
            options={MUSIC_SDK_SOURCES}
            optionLabel={(v) => MUSIC_SDK_SOURCE_LABELS[v as MusicSdkSource]}
            aria-label="音乐源"
          />
          <AppTextFieldBareInput
            placeholder="歌手 ID"
            value={singerId()}
            onInput={(e) => setSingerId(e.currentTarget.value)}
          />
          <AppTextFieldBareInput
            placeholder="歌手名（仅 kw/mg 搜索兜底需要）"
            value={singerName()}
            onInput={(e) => setSingerName(e.currentTarget.value)}
          />
          <Button size="sm" onClick={() => void load()}>
            加载
          </Button>
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
                  <img src={d().coverUrl} alt="" class="h-24 w-24 rounded-full object-cover" />
                </Show>
                <div>
                  <p class="font-medium">{d().name}</p>
                  <Button
                    size="sm"
                    class="mt-2"
                    onClick={() => void playPlaylist(d().tracks, 0)}
                  >
                    播放热门
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
