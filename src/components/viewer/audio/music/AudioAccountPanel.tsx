/**
 * 账号登录与推荐歌单
 */

import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import {
  checkAuthHealth,
  cookiesFromManualInput,
  loadAuthSession,
  openPlatformLogin,
  persistAuthCookies,
  type PlatformId,
} from '@/lib/media/audio/platform/auth/session';
import {
  fetchNeteaseRecommendPlaylists,
  loadNeteasePlaylistTracks,
} from '@/lib/media/audio/platform/playlist-sync';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioAccountPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'netease', label: '网易云音乐' },
  { id: 'bili', label: '哔哩哔哩' },
  { id: 'ytm', label: 'YouTube Music' },
];

export const AudioAccountPanel: Component<AudioAccountPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [platform, setPlatform] = createSignal<PlatformId>('netease');
  const [cookieInput, setCookieInput] = createSignal('');
  const [auth] = createResource(
    () => (active() ? platform() : null),
    async (p) => {
      if (!p) return null;
      const session = await loadAuthSession(p);
      const healthy = await checkAuthHealth(p);
      return { session, healthy };
    },
  );
  const [playlists] = createResource(
    () => (active() && platform() === 'netease' && auth()?.healthy ? true : null),
    () => fetchNeteaseRecommendPlaylists(),
  );

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      hideHeader={props.inline}
      title="平台账号"
      onClose={props.onClose}
    >
      <div class={`flex flex-wrap gap-2 border-b ${props.inline ? 'pb-3 pt-2' : 'p-4'}`}>
            <For each={PLATFORMS}>
              {(p) => (
                <Button
                  size="sm"
                  variant={platform() === p.id ? 'default' : 'outline'}
                  onClick={() => setPlatform(p.id)}
                >
                  {p.label}
                </Button>
              )}
            </For>
          </div>
          <div class={`space-y-3 border-b ${props.inline ? 'py-3' : 'p-4'}`}>
            <p class="text-sm">
              登录状态：
              <span class={auth()?.healthy ? 'text-primary' : 'text-muted-foreground'}>
                {auth()?.healthy ? '已登录' : '未登录'}
              </span>
            </p>
            <Button size="sm" onClick={() => void openPlatformLogin(platform())}>
              WebView 登录
            </Button>
            <AppTextFieldBareTextArea
              class="text-xs"
              rows={3}
              placeholder="或粘贴 Cookie"
              value={cookieInput()}
              onInput={(e) => setCookieInput(e.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void persistAuthCookies(platform(), cookiesFromManualInput(cookieInput()), true)
              }
            >
              保存 Cookie
            </Button>
          </div>
          <Show when={platform() === 'netease' && auth()?.healthy}>
            <div class={`min-h-0 flex-1 overflow-y-auto ${props.inline ? 'pt-3' : 'p-4'}`}>
              <p class="mb-2 text-xs font-medium text-muted-foreground">推荐歌单</p>
              <ul class="space-y-1">
                <For each={playlists() ?? []}>
                  {(pl) => (
                    <li>
                      <Button
                        type="button"
                        variant="ghost"
                        class="h-auto w-full justify-start rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-muted/60"
                        onClick={() =>
                          void loadNeteasePlaylistTracks(pl.id).then((tracks) =>
                            playAsTemp(tracks, 0, {
                              listName: pl.name,
                              listKind: 'online-playlist',
                            }),
                          )
                        }
                      >
                        {pl.name}
                        <span class="ml-2 text-xs text-muted-foreground">{pl.trackCount} 首</span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
    </AudioPanelShell>
  );
};
