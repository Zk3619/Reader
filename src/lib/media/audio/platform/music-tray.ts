/**
 * 主壳托盘：音乐播控菜单 + macOS 状态栏歌词（tray.setTitle）
 */

import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/platform/detect';
import {
  audioShellIsPlaying,
  audioShellSkipNext,
  audioShellSkipPrev,
  audioShellTogglePlay,
  hasAudioShellHandlers,
} from '@/lib/media/audio/audio-shell-controls';
import {
  getMusicSettings,
  setMusicSettings,
} from '@/lib/media/audio/music-settings';
import { viewerStore } from '@/stores/viewer';
import { hideWindowAndSaveState, showWindowAndSaveState } from '@/utils/window-state';

const TRAY_ID = 'main-tray';

function isMacOs(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.platform) || /Mac OS/i.test(navigator.userAgent);
}

function truncateLyric(line: string, max = 30): string {
  const t = line.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function syncMusicStatusBarLyric(lyricLine: string | null | undefined): Promise<void> {
  if (!isTauri() || !isMacOs()) return;
  if (getMusicSettings().showStatusBarLyric !== true) {
    try {
      const tray = await TrayIcon.getById(TRAY_ID);
      await tray?.setTitle(null);
    } catch {
      // ignore
    }
    return;
  }
  const text = truncateLyric(lyricLine ?? '');
  try {
    const tray = await TrayIcon.getById(TRAY_ID);
    if (!tray) return;
    await tray.setTitle(text || null);
    if (text) await tray.setTooltip(text);
  } catch {
    // ignore
  }
}

async function toggleCollectCurrent(): Promise<void> {
  const state = viewerStore.state;
  if (state.playbackMode !== 'music') return;
  const track = state.trackQueue[state.trackIndex];
  if (!track) return;
  const { isTrackInLove, addTrackToLove, removeTrackFromLove } = await import(
    '@/lib/database/audio-library'
  );
  const collected = await isTrackInLove(track.id);
  if (collected) await removeTrackFromLove(track.id);
  else await addTrackToLove(track.id);
}

async function currentTrackLabel(): Promise<string> {
  const state = viewerStore.state;
  if (state.playbackMode !== 'music') return '（无音乐会话）';
  const track = state.trackQueue[state.trackIndex];
  if (!track) return '（未在播放）';
  const label = [track.name, track.artist].filter(Boolean).join(' - ');
  return label.length > 40 ? `${label.slice(0, 40)}…` : label;
}

export async function buildMusicTrayMenuItems(): Promise<
  Awaited<ReturnType<typeof MenuItem.new>>[]
> {
  const hasMusic = hasAudioShellHandlers() && viewerStore.state.playbackMode === 'music';
  const playing = audioShellIsPlaying();
  const trackLabel = await currentTrackLabel();
  const settings = getMusicSettings();

  const trackItem = await MenuItem.new({
    id: 'music-track',
    text: trackLabel,
    enabled: false,
    action: () => undefined,
  });

  const playItem = await MenuItem.new({
    id: 'music-play',
    text: playing ? '暂停' : '播放',
    enabled: hasMusic,
    action: () => {
      audioShellTogglePlay();
      void refreshMusicTrayMenu();
    },
  });

  const prevItem = await MenuItem.new({
    id: 'music-prev',
    text: '上一首',
    enabled: hasMusic,
    action: () => audioShellSkipPrev(),
  });

  const nextItem = await MenuItem.new({
    id: 'music-next',
    text: '下一首',
    enabled: hasMusic,
    action: () => audioShellSkipNext(),
  });

  const collectItem = await MenuItem.new({
    id: 'music-collect',
    text: '收藏 / 取消收藏',
    enabled: hasMusic,
    action: () => {
      void toggleCollectCurrent();
    },
  });

  const lyricShow = await MenuItem.new({
    id: 'music-desktop-lyric',
    text: settings.desktopLyricEnabled ? '关闭桌面歌词' : '打开桌面歌词',
    enabled: isTauri(),
    action: () => {
      void import('@/lib/media/audio/desktop-lyric-window').then(({ toggleDesktopLyricEnabled }) =>
        toggleDesktopLyricEnabled(),
      ).then(() => refreshMusicTrayMenu());
    },
  });

  const lyricLock = await MenuItem.new({
    id: 'music-desktop-lyric-lock',
    text: settings.desktopLyricLocked ? '解锁桌面歌词' : '锁定桌面歌词',
    enabled: isTauri() && settings.desktopLyricEnabled,
    action: () => {
      setMusicSettings({ desktopLyricLocked: !getMusicSettings().desktopLyricLocked });
      void refreshMusicTrayMenu();
    },
  });

  const lyricTop = await MenuItem.new({
    id: 'music-desktop-lyric-top',
    text: settings.desktopLyricAlwaysOnTop ? '取消桌面歌词置顶' : '桌面歌词置顶',
    enabled: isTauri() && settings.desktopLyricEnabled,
    action: () => {
      setMusicSettings({
        desktopLyricAlwaysOnTop: !getMusicSettings().desktopLyricAlwaysOnTop,
      });
      void refreshMusicTrayMenu();
    },
  });

  const items = [
    trackItem,
    playItem,
    prevItem,
    nextItem,
    collectItem,
    lyricShow,
    lyricLock,
    lyricTop,
  ];

  if (isMacOs()) {
    const statusBar = await MenuItem.new({
      id: 'music-status-bar-lyric',
      text: settings.showStatusBarLyric ? '关闭状态栏歌词' : '开启状态栏歌词',
      action: () => {
        const next = !getMusicSettings().showStatusBarLyric;
        setMusicSettings({ showStatusBarLyric: next });
        if (!next) void syncMusicStatusBarLyric(null);
        void refreshMusicTrayMenu();
      },
    });
    items.push(statusBar);
  }

  return items;
}

export async function refreshMusicTrayMenu(): Promise<void> {
  if (!isTauri()) return;
  try {
    const tray = await TrayIcon.getById(TRAY_ID);
    if (!tray) return;
    const musicItems = await buildMusicTrayMenuItems();
    const sep = await PredefinedMenuItem.new({ item: 'Separator' });

    let showText = '显示窗口';
    try {
      const visible = await getCurrentWindow().isVisible();
      showText = visible ? '隐藏窗口' : '显示窗口';
    } catch {
      // ignore
    }

    const showItem = await MenuItem.new({
      id: 'show',
      text: showText,
      action: async () => {
        try {
          const win = getCurrentWindow();
          const visible = await win.isVisible();
          if (visible) {
            await hideWindowAndSaveState();
          } else {
            await showWindowAndSaveState();
          }
          void refreshMusicTrayMenu();
        } catch (error) {
          console.error('切换窗口显示状态失败:', error);
        }
      },
    });

    const quitItem = await MenuItem.new({
      id: 'quit',
      text: '退出Reader',
      action: async () => {
        try {
          await getCurrentWindow().close();
        } catch (error) {
          console.error('关闭窗口失败:', error);
        }
      },
    });

    const menu = await Menu.new({
      items: [...musicItems, sep, showItem, quitItem],
    });
    await tray.setMenu(menu);
  } catch (error) {
    console.warn('[music-tray] refresh menu failed', error);
  }
}
