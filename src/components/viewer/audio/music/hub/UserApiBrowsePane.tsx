/**
 * Hub UserApi 歌单/排行榜浏览
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  listUserApiScripts,
  userApiLeaderboard,
  userApiSongList,
} from '@/lib/media/audio/online/user-api-engine';
import { normalizeUserApiTracks } from '@/lib/media/audio/online/user-api-engine';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrack } from '@/lib/media/audio/track-types';

function extractUserApiTracks(raw: unknown): AudioTrack[] {
  if (Array.isArray(raw)) return raw as AudioTrack[];
  if (raw && typeof raw === 'object') {
    const list = (raw as { list?: unknown }).list;
    if (Array.isArray(list)) return list as AudioTrack[];
  }
  return [];
}

export const UserApiBrowsePane: Component = () => {
  const [scriptId, setScriptId] = createSignal('');
  const [action, setAction] = createSignal<'tags' | 'boards' | 'list'>('tags');
  const [param, setParam] = createSignal('');
  const [tracks, setTracks] = createSignal<AudioTrack[]>([]);
  const [rawPreview, setRawPreview] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const scripts = () => listUserApiScripts().filter((s) => s.enabled);

  const browse = async () => {
    const id = scriptId() || scripts()[0]?.id;
    if (!id) return;
    setLoading(true);
    try {
      let result: unknown;
      if (action() === 'boards') {
        result = await userApiLeaderboard(id, 'boards', {});
      } else if (action() === 'list') {
        result = await userApiSongList(id, 'detail', { id: param() });
        const list = normalizeUserApiTracks(id, extractUserApiTracks(result));
        setTracks(list);
        setRawPreview(JSON.stringify(result, null, 2).slice(0, 2000));
        return;
      } else {
        result = await userApiSongList(id, 'tags', {});
      }
      setRawPreview(JSON.stringify(result, null, 2).slice(0, 4000));
      setTracks([]);
    } catch (e) {
      setRawPreview(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-2 border-b p-4 text-sm">
        <Show
          when={scripts().length > 0}
          fallback={
            <p class="text-muted-foreground">
              暂无已启用的 UserApi 脚本。请在「设置 → 基本」中导入自定义源。
            </p>
          }
        >
          <select
            class="w-full rounded-md border px-2 py-1.5"
            value={scriptId() || scripts()[0]?.id}
            onChange={(e) => setScriptId(e.currentTarget.value)}
          >
            <For each={scripts()}>
              {(s) => <option value={s.id}>{s.name}</option>}
            </For>
          </select>
          <select
            class="w-full rounded-md border px-2 py-1.5"
            value={action()}
            onChange={(e) => setAction(e.currentTarget.value as 'tags' | 'boards' | 'list')}
          >
            <option value="tags">歌单标签</option>
            <option value="boards">排行榜</option>
            <option value="list">歌单详情</option>
          </select>
          <Show when={action() === 'list'}>
            <input
              class="w-full rounded-md border px-3 py-1.5"
              placeholder="歌单 ID"
              value={param()}
              onInput={(e) => setParam(e.currentTarget.value)}
            />
          </Show>
          <Button size="sm" onClick={() => void browse()}>
            浏览
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        <Show when={loading()}>
          <p class="text-muted-foreground">加载中…</p>
        </Show>
        <Show when={tracks().length > 0}>
          <Button size="sm" class="mb-2" onClick={() => void playPlaylist(tracks(), 0)}>
            播放全部
          </Button>
          <ul class="space-y-1">
            <For each={tracks()}>
              {(t, i) => (
                <li>
                  <button
                    type="button"
                    class="w-full rounded px-2 py-1 text-left hover:bg-muted"
                    onClick={() => void playPlaylist(tracks(), i())}
                  >
                    {t.name} — {t.artist}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={rawPreview()}>
          <pre class="mt-2 whitespace-pre-wrap break-all rounded border bg-muted/30 p-2 text-xs">
            {rawPreview()}
          </pre>
        </Show>
      </div>
    </div>
  );
};
