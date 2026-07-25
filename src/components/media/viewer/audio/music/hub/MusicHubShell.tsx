/**
 * 音乐 Hub 根壳层：响应式分支桌面/移动，导航遵循主壳配置
 */

import { onMount, onCleanup, Show, type Accessor, type Component } from 'solid-js';
import { useMusicHubShellNav } from '@/components/media/viewer/audio/music/hub/music-hub-mobile-chrome';
import { useMusicHubPlayer } from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { MusicHubDesktopLayout } from '@/components/media/viewer/audio/music/hub/MusicHubDesktopLayout';
import { MusicHubMobileLayout } from '@/components/media/viewer/audio/music/hub/MusicHubMobileLayout';
import { UserApiUpdateAlertHost } from '@/components/media/viewer/audio/music/UserApiUpdateAlertHost';
import { UserApiInitFailedHost } from '@/components/media/viewer/audio/music/UserApiInitFailedHost';
import { registerMusicOpenApiHandler } from '@/lib/media/audio/platform/music-openapi-client';
import { playNextTrack, playPrevTrack } from '@/stores/viewer/media/audio';
import { isTauri } from '@/lib/platform/detect';
import { ensureUserApiScriptsInitialized } from '@/lib/media/audio/online/user-api-engine';
import {
  addTrackToLove,
  isTrackInLove,
  removeTrackFromLove,
} from '@/lib/database/audio-library';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { startMusicOpenApi } from '@/lib/media/audio/platform/music-openapi-client';
import { startLxSyncServer } from '@/lib/media/audio/sync/lx-sync-server';
// MF Hub 主题包运行时已弃用：restoreMfThemePackFromStorage / MusicHubMfThemeLayer 保留代码，待主题工作室接入
import { refreshNetworkKind } from '@/lib/platform/network';

export interface MusicHubShellProps {
  active?: boolean | Accessor<boolean>;
}

export const MusicHubShell: Component<MusicHubShellProps> = (_props) => {
  const hubPlayer = useMusicHubPlayer();
  const { useMobileLayout, hideInternalNav } = useMusicHubShellNav();

  onMount(() => {
    void refreshNetworkKind();
    void import('@/lib/media/audio/online/mf-plugin/global-settings').then(({ getMfGlobalSettings }) => {
      if (!getMfGlobalSettings().autoUpdatePlugin) return;
      void import('@/lib/media/audio/online/mf-plugin/update').then(({ applyAllMfPluginUpdates, checkAllMfPluginUpdates }) =>
        checkAllMfPluginUpdates().then((infos) => applyAllMfPluginUpdates(infos)),
      );
    });
    // 先挂好更新弹窗订阅（组件内），再预热音源 runtime 触发 updateAlert
    void ensureUserApiScriptsInitialized();
    const serviceSettings = getMusicSettings();
    if (isTauri() && serviceSettings.openApiEnabled && serviceSettings.openApiAutoStart) {
      void startMusicOpenApi(
        serviceSettings.openApiPort,
        serviceSettings.openApiBindAddress,
      ).catch((error) => console.warn('[music] OpenAPI 自动启动失败', error));
    }
    if (isTauri() && serviceSettings.localSyncEnabled && serviceSettings.localSyncAutoStart) {
      void startLxSyncServer({ port: serviceSettings.localSyncPort }).catch((error) =>
        console.warn('[music] Sync Server 自动启动失败', error),
      );
    }
    const setCollected = async (requested?: boolean) => {
      const track = hubPlayer.currentTrack();
      if (!track) return;
      const collected = requested ?? !(await isTrackInLove(track.id));
      if (collected) await addTrackToLove(track.id);
      else await removeTrackFromLove(track.id);
      hubPlayer.setMusicCollected(collected);
    };
    const toggleDesktopLyric = async () => {
      if (!isTauri()) return;
      const { toggleDesktopLyricEnabled } = await import(
        '@/lib/media/audio/desktop-lyric-window'
      );
      await toggleDesktopLyricEnabled();
    };
    const handleAction = (action: string, payload: Record<string, unknown> = {}) => {
      switch (action) {
        case 'play':
          void hubPlayer.playOrFetch();
          break;
        case 'pause':
          if (hubPlayer.player.playing()) hubPlayer.player.togglePlay();
          break;
        case 'next':
          void playNextTrack({ manual: true });
          break;
        case 'prev':
          void playPrevTrack({ manual: true });
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
        case 'collect':
          void setCollected(
            typeof payload.collect === 'boolean' ? payload.collect : undefined,
          );
          break;
        case 'lyric_toggle':
          void toggleDesktopLyric();
          break;
        case 'lyric-all':
          break;
        default:
          break;
      }
    };
    const unreg = registerMusicOpenApiHandler(handleAction);
    let unlistenHotkey: (() => void) | undefined;
    let cleanedUp = false;
    if (isTauri()) {
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<{ action?: string }>('music-hotkey', (e) => {
          handleAction(e.payload.action ?? '');
        }).then((fn) => {
          if (cleanedUp) fn();
          else unlistenHotkey = fn;
        }),
      );
    }
    onCleanup(() => {
      cleanedUp = true;
      unreg();
      unlistenHotkey?.();
    });
  });

  return (
    <div class="app-container relative flex min-h-0 flex-1 flex-col" data-music-hub="true">
      <div class="relative z-1 flex min-h-0 flex-1 flex-col">
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
    </div>
  );
};
