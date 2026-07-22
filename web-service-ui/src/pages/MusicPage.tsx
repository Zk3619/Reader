import { createResource, For, Show } from 'solid-js';
import { Card, ErrorBox, Loading, Layout } from '@/components/Layout';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ApiConnectionPanel } from '@/components/ApiConnectionPanel';
import { getAudioPlaylists, type WebMusicPlaylist } from '@/lib/api';
import { formatResourceError } from '@/lib/resource';

export function MusicPage() {
  const [data] = createResource(async () => getAudioPlaylists());

  return (
    <Layout>
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">音乐</h1>
          <p class="text-sm text-muted-foreground">浏览本机歌单，在浏览器播放或遥控 Reader</p>
        </div>
        <div class="flex items-center gap-2">
          <ThemeToggle />
          <a href="#/" class="text-sm text-primary underline-offset-2 hover:underline">
            首页
          </a>
        </div>
      </div>

      <ApiConnectionPanel />

      <Show when={data.error}>
        <ErrorBox message={formatResourceError(data.error)} />
      </Show>
      <Show when={data.loading}>
        <Loading />
      </Show>
      <Show when={data()?.playlists}>
        {(lists) => (
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={lists()}>
              {(pl: WebMusicPlaylist) => (
                <a href={`#/music/play?id=${encodeURIComponent(pl.id)}`}>
                  <Card class="transition hover:border-primary/40 hover:shadow-md">
                    <p class="font-medium">{pl.name}</p>
                    <p class="mt-1 text-xs text-muted-foreground">{pl.trackCount} 首</p>
                  </Card>
                </a>
              )}
            </For>
          </div>
        )}
      </Show>
    </Layout>
  );
}
