import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { Card, ErrorBox, Loading, Layout, Button } from '@/components/Layout';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  getAudioPlaylist,
  getAudioTrackUrl,
  postAudioPlay,
  postAudioProgress,
  resolveAudioStreamUrl,
  type WebMusicTrack,
} from '@/lib/api';
import { formatResourceError } from '@/lib/resource';
import { resolveApiUrl } from '@/lib/api-config';

function playlistIdFromHash(): string {
  const hash = window.location.hash;
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(q).get('id') ?? '';
}

export function MusicPlayPage() {
  const listId = createMemo(() => playlistIdFromHash());
  const [data] = createResource(listId, async (id) => {
    if (!id) throw new Error('缺少歌单 id');
    return getAudioPlaylist(id);
  });
  const [current, setCurrent] = createSignal<WebMusicTrack | null>(null);
  const [audioUrl, setAudioUrl] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  let audioRef: HTMLAudioElement | undefined;

  const playInBrowser = async (track: WebMusicTrack) => {
    setBusy(true);
    setError('');
    try {
      const info = await getAudioTrackUrl(track.id);
      const url =
        info.mode === 'stream'
          ? resolveAudioStreamUrl(track.id)
          : info.url.startsWith('http')
            ? info.url
            : resolveApiUrl(info.url);
      setCurrent(track);
      setAudioUrl(url);
      requestAnimationFrame(() => {
        void audioRef?.play().catch(() => undefined);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '播放失败');
    } finally {
      setBusy(false);
    }
  };

  const playOnHost = async (track: WebMusicTrack) => {
    setBusy(true);
    setError('');
    try {
      await postAudioPlay({
        action: 'play-track',
        trackId: track.id,
        playlistId: listId() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '遥控失败');
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    const track = current();
    const el = audioRef;
    if (!track || !el) return;
    const onTime = () => {
      if (el.currentTime > 0 && Math.floor(el.currentTime) % 5 === 0) {
        void postAudioProgress(track.id, el.currentTime).catch(() => undefined);
      }
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  });

  return (
    <Layout>
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="#/music" class="text-sm text-primary underline-offset-2 hover:underline">
            ← 歌单列表
          </a>
          <h1 class="mt-1 text-2xl font-bold">{data()?.name ?? '播放'}</h1>
        </div>
        <ThemeToggle />
      </div>

      <Show when={error()}>
        <ErrorBox message={error()} />
      </Show>
      <Show when={data.error}>
        <ErrorBox message={formatResourceError(data.error)} />
      </Show>
      <Show when={data.loading}>
        <Loading />
      </Show>

      <Show when={current()}>
        {(t) => (
          <Card class="mb-4 space-y-2">
            <p class="font-medium">{t().name}</p>
            <p class="text-xs text-muted-foreground">{t().artist}</p>
            <audio
              ref={(el) => {
                audioRef = el;
              }}
              class="w-full"
              controls
              src={audioUrl()}
              preload="metadata"
            />
          </Card>
        )}
      </Show>

      <Show when={data()?.tracks}>
        {(tracks) => (
          <div class="space-y-2">
            <For each={tracks()}>
              {(track) => (
                <Card class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-medium">{track.name}</p>
                    <p class="truncate text-xs text-muted-foreground">
                      {track.artist} · {track.duration}
                    </p>
                  </div>
                  <div class="flex shrink-0 gap-2">
                    <Button
                      class="min-h-9 px-3 text-xs"
                      disabled={busy()}
                      onClick={() => void playInBrowser(track)}
                    >
                      浏览器播
                    </Button>
                    <Button
                      class="min-h-9 px-3 text-xs"
                      variant="ghost"
                      disabled={busy()}
                      onClick={() => void playOnHost(track)}
                    >
                      本机播
                    </Button>
                  </div>
                </Card>
              )}
            </For>
          </div>
        )}
      </Show>
    </Layout>
  );
}
