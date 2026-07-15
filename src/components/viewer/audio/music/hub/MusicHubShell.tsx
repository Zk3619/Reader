/**
 * 音乐 Hub 根壳层：响应式分支桌面/移动，导航遵循主壳配置
 */

import { onMount, onCleanup, Show, type Accessor, type Component } from 'solid-js';
import { useMusicHubShellNav } from '@/components/viewer/audio/music/hub/music-hub-mobile-chrome';
import { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { MusicHubDesktopLayout } from '@/components/viewer/audio/music/hub/MusicHubDesktopLayout';
import { MusicHubMobileLayout } from '@/components/viewer/audio/music/hub/MusicHubMobileLayout';
import { UserApiUpdateAlertHost } from '@/components/viewer/audio/music/UserApiUpdateAlertHost';
import { UserApiInitFailedHost } from '@/components/viewer/audio/music/UserApiInitFailedHost';
import { registerMusicOpenApiHandler } from '@/lib/media/audio/platform/music-openapi-client';
import { playNextTrack, playPrevTrack } from '@/stores/viewer/media/audio';
import { isTauri } from '@/lib/platform/detect';
import { ensureUserApiScriptsInitialized } from '@/lib/media/audio/online/user-api-engine';

export interface MusicHubShellProps {
  active?: boolean | Accessor<boolean>;
}

export const MusicHubShell: Component<MusicHubShellProps> = (_props) => {
  const hubPlayer = useMusicHubPlayer();
  const { useMobileLayout, hideInternalNav } = useMusicHubShellNav();

  onMount(() => {
    // 先挂好更新弹窗订阅（组件内），再预热音源 runtime 触发 updateAlert
    void ensureUserApiScriptsInitialized();
    const unreg = registerMusicOpenApiHandler((action, payload) => {
      switch (action) {
        case 'play':
          hubPlayer.player.togglePlay();
          break;
        case 'pause':
          if (hubPlayer.player.playing()) hubPlayer.player.togglePlay();
          break;
        case 'next':
          void playNextTrack();
          break;
        case 'prev':
          void playPrevTrack();
          break;
        case 'seek': {
          const pos = Number(payload.position ?? 0);
          if (Number.isFinite(pos)) hubPlayer.player.seekTo(pos);
          break;
        }
        case 'volume': {
          const vol = Number(payload.volume ?? 1);
          if (Number.isFinite(vol)) hubPlayer.setMusicVolume(Math.max(0, Math.min(1, vol)));
          break;
        }
        case 'mute':
          hubPlayer.setMusicMuted(!hubPlayer.musicMuted());
          break;
        case 'collect':
          void import('@/lib/database/audio-library').then(({ addTrackToLove, removeTrackFromLove }) => {
            const t = hubPlayer.currentTrack();
            if (!t) return;
            if (payload.collect === false) void removeTrackFromLove(t.id);
            else void addTrackToLove(t.id);
          });
          break;
        case 'lyric-all':
          break;
        default:
          break;
      }
    });
    let unlistenHotkey: (() => void) | undefined;
    if (isTauri()) {
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<{ action?: string }>('music-hotkey', (e) => {
          switch (e.payload.action) {
            case 'play':
              hubPlayer.player.togglePlay();
              break;
            case 'pause':
              if (hubPlayer.player.playing()) hubPlayer.player.togglePlay();
              break;
            case 'next':
              void playNextTrack();
              break;
            case 'prev':
              void playPrevTrack();
              break;
            case 'vol_up':
              hubPlayer.setMusicVolume(Math.min(1, hubPlayer.musicVolume() + 0.05));
              break;
            case 'vol_down':
              hubPlayer.setMusicVolume(Math.max(0, hubPlayer.musicVolume() - 0.05));
              break;
            case 'mute':
              hubPlayer.setMusicMuted(!hubPlayer.musicMuted());
              break;
            case 'seek_forward':
              hubPlayer.player.seekTo(hubPlayer.player.currentTime() + 10);
              break;
            case 'seek_back':
              hubPlayer.player.seekTo(Math.max(0, hubPlayer.player.currentTime() - 10));
              break;
          }
        }).then((fn) => {
          unlistenHotkey = fn;
        }),
      );
    }
    onCleanup(() => {
      unreg();
      unlistenHotkey?.();
    });
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <audio ref={hubPlayer.bindAudio} class="hidden" />
      <UserApiUpdateAlertHost />
      <UserApiInitFailedHost />
      <Show
        when={useMobileLayout()}
        fallback={<MusicHubDesktopLayout player={hubPlayer} hideAside={hideInternalNav()} />}
      >
        <MusicHubMobileLayout
          player={hubPlayer}
          active={_props.active}
          hideChrome={hideInternalNav()}
        />
      </Show>
    </div>
  );
};
