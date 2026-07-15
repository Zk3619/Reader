/**
 * 桌面悬浮歌词页（Tauri 第二窗口加载 #lyric-desktop）
 */

import { createEffect, createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { AudioLyricPanel } from '@/components/viewer/audio/AudioLyricPanel';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { isTauri } from '@/lib/platform/detect';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';

export const LyricDesktopPage: Component = () => {
  const [title, setTitle] = createSignal('');
  const [artist, setArtist] = createSignal('');
  const [lyricBundle, setLyricBundle] = createSignal<LyricBundle | null>(null);
  const [positionSec, setPositionSec] = createSignal(0);

  const lyricTrack = (): LyricTrackKind =>
    getMusicSettings().desktopLyricTrack ?? getMusicSettings().lyricTrack ?? 'lxlyric';

  const startDrag = async (e: MouseEvent) => {
    if (!isTauri() || e.button !== 0) return;
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().startDragging();
    } catch {
      /* ignore */
    }
  };

  const emitCommand = async (action: string) => {
    if (!isTauri()) return;
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('desktop-lyric-command', { action });
    } catch {
      /* ignore */
    }
  };

  onMount(() => {
    document.documentElement.classList.add('lyric-desktop');
    if (!isTauri()) return;

    let unlistenUpdate: (() => void) | undefined;
    let unlistenCmd: (() => void) | undefined;

    void import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{
        title?: string;
        artist?: string;
        lyric?: string;
        lyricAll?: LyricBundle;
        positionSec?: number;
      }>('desktop-lyric-update', (e) => {
        if (e.payload.title) setTitle(e.payload.title);
        if (e.payload.artist) setArtist(e.payload.artist);
        if (e.payload.lyricAll) {
          setLyricBundle(e.payload.lyricAll);
        } else if (e.payload.lyric != null) {
          setLyricBundle({ lyric: e.payload.lyric });
        }
        if (e.payload.positionSec != null) setPositionSec(e.payload.positionSec);
      }).then((fn) => {
        unlistenUpdate = fn;
      });

      listen<{ action?: string }>('desktop-lyric-command', async (e) => {
        const action = e.payload.action;
        if (action === 'toggle-penetrate') {
          const settings = getMusicSettings();
          const next = !settings.desktopLyricPenetrate;
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('set_desktop_lyric_ignore_cursor', { ignore: next });
        }
      }).then((fn) => {
        unlistenCmd = fn;
      });
    });

    const penetrate = getMusicSettings().desktopLyricPenetrate;
    if (penetrate) {
      void import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('set_desktop_lyric_ignore_cursor', { ignore: true }),
      );
    }

    onCleanup(() => {
      unlistenUpdate?.();
      unlistenCmd?.();
    });
  });

  createEffect(() => {
    const opacity = getMusicSettings().desktopLyricOpacity ?? 0.85;
    document.body.style.background = `rgba(0,0,0,${opacity})`;
  });

  const fontSize = () => getMusicSettings().desktopLyricFontSize ?? 20;

  return (
    <div
      class="flex h-screen w-screen select-none items-center justify-center p-4 text-white"
      style={{ 'font-size': `${fontSize()}px` }}
      onMouseDown={(e) => void startDrag(e)}
      onDblClick={() => void emitCommand('toggle-penetrate')}
    >
      <div class="max-w-2xl text-center">
        <p class="mb-2 text-lg font-medium opacity-80">{title()}</p>
        <p class="mb-4 text-sm text-white/60">{artist()}</p>
        <AudioLyricPanel
          class="max-h-none bg-transparent"
          bundle={lyricBundle()}
          lyricTrack={lyricTrack()}
          positionSec={positionSec()}
          lyricOffset={getMusicSettings().lyricOffset}
          showTranslation={getMusicSettings().showLyricTranslation}
          showRoma={getMusicSettings().showLyricRoma}
          secondaryOrder={getMusicSettings().lyricSecondaryOrder}
          align={getMusicSettings().desktopLyricAlign}
          fontSize={getMusicSettings().desktopLyricFontSize}
          zoomActiveLyric={getMusicSettings().desktopLyricZoomActive}
          singleLine={getMusicSettings().desktopLyricSingleLine}
          maxLines={getMusicSettings().desktopLyricMaxLines}
          playedColor={getMusicSettings().desktopLyricPlayedColor}
          unplayedColor={getMusicSettings().desktopLyricUnplayedColor}
        />
      </div>
    </div>
  );
};
