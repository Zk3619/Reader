/**
 * 在线搜索面板
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  searchOnline,
  listSearchSources,
  BUILTIN_SOURCE_LABELS,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import { playTrack } from '@/stores/viewer/media/audio';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioSearchPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioSearchPanel: Component<AudioSearchPanelProps> = (props) => {
  const [keyword, setKeyword] = createSignal('');
  const [source, setSource] = createSignal<SearchSource>('wy');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [searched, setSearched] = createSignal(false);
  const [results, setResults] = createSignal<
    Awaited<ReturnType<typeof searchOnline>>['tracks']
  >([]);

  const active = () => props.inline || props.open;

  const sourceLabel = (s: SearchSource) => {
    if (s.startsWith('userApi:')) return `自定义: ${s.slice('userApi:'.length)}`;
    return BUILTIN_SOURCE_LABELS[s] ?? s.toUpperCase();
  };

  const doSearch = async () => {
    const q = keyword().trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const res = await searchOnline(source(), q);
      setResults(res.tracks);
      setSearched(true);
    } catch (e) {
      setResults([]);
      setSearched(true);
      setError(e instanceof Error ? e.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="搜索音乐"
      onClose={props.onClose}
    >
      <div class="space-y-2 border-b p-4">
        <select
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={source()}
          onChange={(e) => setSource(e.currentTarget.value as SearchSource)}
        >
          <For each={listSearchSources()}>
            {(s) => <option value={s}>{sourceLabel(s)}</option>}
          </For>
        </select>
        <div class="flex gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="搜索歌曲、歌手"
            value={keyword()}
            onInput={(e) => setKeyword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
          />
          <Button disabled={loading()} onClick={() => void doSearch()}>
            {loading() ? '搜索中…' : '搜索'}
          </Button>
        </div>
        <Show when={error()}>
          <p class="text-sm text-destructive">{error()}</p>
        </Show>
      </div>
      <ul class="p-2">
        <Show
          when={active() && results().length > 0}
          fallback={
            <Show when={active() && searched() && !loading() && !error()}>
              <li class="px-3 py-8 text-center text-sm text-muted-foreground">
                未找到相关歌曲，可换关键词或其他音源重试
              </li>
            </Show>
          }
        >
          <For each={results()}>
            {(track) => (
              <li>
                <button
                  type="button"
                  class="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted/60"
                  onClick={() => void playTrack(track)}
                >
                  <span class="truncate text-sm font-medium">{track.name}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {track.artist} · {BUILTIN_SOURCE_LABELS[track.source] ?? track.source}
                  </span>
                </button>
              </li>
            )}
          </For>
        </Show>
      </ul>
    </AudioPanelShell>
  );
};
