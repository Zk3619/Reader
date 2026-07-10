/**
 * 桌面集成：OpenAPI / 全局热键 / 桌面歌词
 */

import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/platform/detect';
import {
  startMusicOpenApi,
  stopMusicOpenApi,
  registerMusicOpenApiHandler,
} from '@/lib/media/audio/platform/music-openapi-client';
import { startLxSyncServer, stopLxSyncServer } from '@/lib/media/audio/sync/lx-sync-server';
import { playNextTrack, playPrevTrack } from '@/stores/viewer/media/audio';

const HOTKEY_STORAGE = 'reader.music.hotkeys';

function loadHotkeys() {
  try {
    const raw = localStorage.getItem(HOTKEY_STORAGE);
    return raw
      ? (JSON.parse(raw) as Record<string, string>)
      : {
          play: 'Ctrl+Alt+P',
          pause: 'Ctrl+Alt+U',
          next: 'Ctrl+Alt+Right',
          prev: 'Ctrl+Alt+Left',
          vol_up: 'Ctrl+Alt+Up',
          vol_down: 'Ctrl+Alt+Down',
          mute: '',
          collect: '',
          lyric_toggle: '',
          seek_forward: 'Ctrl+Alt+]',
          seek_back: 'Ctrl+Alt+[',
        };
  } catch {
    return { play: 'Ctrl+Alt+P', pause: 'Ctrl+Alt+U', next: 'Ctrl+Alt+Right', prev: 'Ctrl+Alt+Left' };
  }
}

export const MusicSettingsDesktop: Component = () => {
  const [openapiPort, setOpenapiPort] = createSignal(2333);
  const [syncPort, setSyncPort] = createSignal(9527);
  const [hotkeys, setHotkeys] = createSignal(loadHotkeys());
  const [openapiOn, setOpenapiOn] = createSignal(false);
  const [syncOn, setSyncOn] = createSignal(false);
  const [syncPassword, setSyncPassword] = createSignal('');
  const [openapiBind, setOpenapiBind] = createSignal('127.0.0.1');

  const toggleOpenapi = async () => {
    if (!isTauri()) return;
    if (openapiOn()) {
      await stopMusicOpenApi();
      setOpenapiOn(false);
    } else {
      await startMusicOpenApi(openapiPort(), openapiBind());
      registerMusicOpenApiHandler((action) => {
        switch (action) {
          case 'next':
            void playNextTrack();
            break;
          case 'prev':
            void playPrevTrack();
            break;
          default:
            break;
        }
      });
      setOpenapiOn(true);
    }
  };

  const toggleSyncServer = async () => {
    if (!isTauri()) return;
    if (syncOn()) {
      await stopLxSyncServer();
      setSyncOn(false);
    } else {
      await startLxSyncServer({ port: syncPort(), password: syncPassword() || undefined });
      setSyncOn(true);
    }
  };

  const applyHotkeys = async () => {
    if (!isTauri()) return;
    localStorage.setItem(HOTKEY_STORAGE, JSON.stringify(hotkeys()));
    const { invoke } = await import('@tauri-apps/api/core');
    const h = hotkeys();
    await invoke('register_music_hotkeys', {
      play: h.play ?? '',
      pause: h.pause ?? '',
      next: h.next ?? '',
      prev: h.prev ?? '',
      volUp: h.vol_up ?? '',
      volDown: h.vol_down ?? '',
      mute: h.mute ?? '',
      collect: h.collect ?? '',
      lyricToggle: h.lyric_toggle ?? '',
      seekForward: h.seek_forward ?? '',
      seekBack: h.seek_back ?? '',
    });
  };

  const openDesktopLyric = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_desktop_lyric_window');
  };

  if (!isTauri()) {
    return (
      <div class="p-4 text-sm text-muted-foreground">
        OpenAPI、全局热键与桌面歌词仅 Tauri 桌面端可用。
      </div>
    );
  }

  return (
    <div class="space-y-4 p-4 text-sm">
      <section class="space-y-2">
        <h3 class="font-medium">OpenAPI</h3>
        <input
          type="number"
          class="w-24 rounded border px-2 py-1"
          value={openapiPort()}
          onInput={(e) => setOpenapiPort(Number(e.currentTarget.value))}
        />
        <input
          class="ml-2 w-32 rounded border px-2 py-1"
          placeholder="绑定 IP"
          value={openapiBind()}
          onInput={(e) => setOpenapiBind(e.currentTarget.value)}
        />
        <Button size="sm" class="ml-2" onClick={() => void toggleOpenapi()}>
          {openapiOn() ? '停止' : '启动'}
        </Button>
      </section>
      <section class="space-y-2">
        <h3 class="font-medium">本机 Sync Server</h3>
        <input
          type="number"
          class="w-24 rounded border px-2 py-1"
          value={syncPort()}
          onInput={(e) => setSyncPort(Number(e.currentTarget.value))}
        />
        <input
          type="password"
          class="ml-2 w-32 rounded border px-2 py-1"
          placeholder="同步密码"
          value={syncPassword()}
          onInput={(e) => setSyncPassword(e.currentTarget.value)}
        />
        <Button size="sm" class="ml-2" onClick={() => void toggleSyncServer()}>
          {syncOn() ? '停止托管' : '本机托管'}
        </Button>
      </section>
      <section class="space-y-2">
        <h3 class="font-medium">全局热键</h3>
        {(['play', 'pause', 'next', 'prev', 'vol_up', 'vol_down', 'seek_forward', 'seek_back'] as const).map((k) => (
          <label class="flex items-center gap-2">
            <span class="w-12 text-muted-foreground">{k}</span>
            <input
              class="flex-1 rounded border px-2 py-1"
              value={hotkeys()[k]}
              onInput={(e) => setHotkeys((h) => ({ ...h, [k]: e.currentTarget.value }))}
            />
          </label>
        ))}
        <Button size="sm" onClick={() => void applyHotkeys()}>
          应用热键
        </Button>
      </section>
      <section>
        <Button size="sm" variant="outline" onClick={() => void openDesktopLyric()}>
          打开桌面歌词
        </Button>
      </section>
    </div>
  );
};
