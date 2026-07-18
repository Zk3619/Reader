/**
 * 在线搜索面板
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  searchOnline,
  listSearchSources,
  BUILTIN_SOURCE_LABELS,
  type SearchSource,
} from '@/lib/media/audio/online/source-router';
import { playTrack } from '@/stores/viewer/media/audio';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';

export interface AudioSearchPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioSearchPanel: Component<AudioSearchPanelProps> = (props) => {
  const [keyword, setKeyword] = createSignal('');
  const [source, setSource] = createSignal<SearchSource>('wy');
  const [loading, setLoading] = createSignal(false);
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
    setSearched(false);
    try {
      const res = await searchOnline(source(), q);
      setResults(res.tracks);
      setSearched(true);
    } catch (e) {
      setResults([]);
      setSearched(true);
      showAppToast({
        title: '搜索失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
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
        <MusicAppSelect
          value={source()}
          onChange={(v) => setSource(v as SearchSource)}
          options={listSearchSources()}
          optionLabel={sourceLabel}
          aria-label="搜索源"
        />
        <div class="flex gap-2">
          <AppTextFieldBareInput
            class="min-w-0 flex-1"
            placeholder="搜索歌曲、歌手"
            value={keyword()}
            onInput={(e) => setKeyword(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && void doSearch()}
          />
          <Button disabled={loading()} onClick={() => void doSearch()}>
            {loading() ? '搜索中…' : '搜索'}
          </Button>
        </div>
      </div>
      <ul class="p-2">
        <Show
          when={active() && results().length > 0}
          fallback={
            <Show when={active() && searched() && !loading()}>
              <li class="px-3 py-8 text-center text-sm text-muted-foreground">
                未找到相关歌曲，可换关键词或其他音源重试
              </li>
            </Show>
          }
        >
          <For each={results()}>
            {(track) => (
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  class="h-auto w-full flex-col items-start rounded-lg px-3 py-2 font-normal hover:bg-muted/60"
                  onClick={() => void playTrack(track)}
                >
                  <span class="truncate text-sm font-medium">{track.name}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {track.artist} · {BUILTIN_SOURCE_LABELS[track.source] ?? track.source}
                  </span>
                </Button>
              </li>
            )}
          </For>
        </Show>
      </ul>
    </AudioPanelShell>
  );
};
