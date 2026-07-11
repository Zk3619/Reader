/**
 * Hub UserApi 歌单/排行榜浏览
 */

import { createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  listUserApiScripts,
  userApiLeaderboard,
  userApiSongList,
} from '@/lib/media/audio/online/user-api-engine';
import { normalizeUserApiTracks } from '@/lib/media/audio/online/user-api-engine';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';

function extractUserApiTracks(raw: unknown): AudioTrack[] {
  if (Array.isArray(raw)) return raw as AudioTrack[];
  if (raw && typeof raw === 'object') {
    const list = (raw as { list?: unknown }).list;
    if (Array.isArray(list)) return list as AudioTrack[];
  }
  return [];
}

const USER_API_ACTIONS = ['tags', 'boards', 'list'] as const;
const USER_API_ACTION_LABELS: Record<(typeof USER_API_ACTIONS)[number], string> = {
  tags: '歌单标签',
  boards: '排行榜',
  list: '歌单详情',
};

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
    <MusicHubPageShell
      section="userApi"
      below={
        <Show
          when={scripts().length > 0}
          fallback={
            <p class="px-4 pb-2 text-sm text-muted-foreground">
              暂无已启用的 UserApi 脚本。请在「设置 → 基本」中导入自定义源。
            </p>
          }
        >
          <div class="space-y-2 px-4 pb-2 text-sm">
            <MusicAppSelect
              value={scriptId() || scripts()[0]?.id || ''}
              onChange={setScriptId}
              options={scripts().map((s) => s.id)}
              optionLabel={(id) => scripts().find((s) => s.id === id)?.name ?? id}
              aria-label="UserApi 脚本"
            />
            <MusicAppSelect
              value={action()}
              onChange={(v) => setAction(v as 'tags' | 'boards' | 'list')}
              options={USER_API_ACTIONS}
              optionLabel={(v) => USER_API_ACTION_LABELS[v]}
              aria-label="浏览类型"
            />
            <Show when={action() === 'list'}>
              <AppTextFieldBareInput
                placeholder="歌单 ID"
                value={param()}
                onInput={(e) => setParam(e.currentTarget.value)}
              />
            </Show>
            <Button size="sm" onClick={() => void browse()}>
              浏览
            </Button>
          </div>
        </Show>
      }
    >
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4 text-sm">
        <Show when={loading()}>
          <p class="text-muted-foreground">加载中…</p>
        </Show>
        <Show when={tracks().length > 0}>
          <Button size="sm" onClick={() => void playPlaylist(tracks(), 0)}>
            播放全部
          </Button>
          <ul class="space-y-1">
            <For each={tracks()}>
              {(t, i) => (
                <li>
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto w-full justify-start rounded px-2 py-1 font-normal hover:bg-muted"
                    onClick={() => void playPlaylist(tracks(), i())}
                  >
                    {t.name} — {t.artist}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={rawPreview()}>
          <pre class="whitespace-pre-wrap break-all rounded border bg-muted/30 p-2 text-xs">
            {rawPreview()}
          </pre>
        </Show>
      </div>
    </MusicHubPageShell>
  );
};
