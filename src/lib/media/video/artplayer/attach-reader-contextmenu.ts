/**
 * Artplayer 右键菜单：对齐常见桌面播放器条目
 * 复制地址(精准空降) / 色彩 / 音效 / 快捷键 / 更新历史 / 统计
 */

import type Artplayer from 'artplayer';
import packageInfo from '../../../../../package.json';
import {
  AUDIO_EQ_PRESET_OPTIONS,
  type AudioEqPreset,
} from '@/lib/media/video/playback/audio-eq';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
} from '@/lib/media/video/playback/prefs';
import { getArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';

const DEFAULT_NAMES = [
  'info',
  'version',
  'close',
  'playbackRate',
  'aspectRatio',
  'flip',
] as const;

const PANEL_LAYER = 'reader-ctx-panel';

type ColorState = {
  brightness: number;
  contrast: number;
  saturate: number;
  hue: number;
};

const DEFAULT_COLOR: ColorState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
};

const colorByArt = new WeakMap<Artplayer, ColorState>();

const HOTKEY_ROWS: Array<{ keys: string; desc: string }> = [
  { keys: '空格', desc: '播放 / 暂停' },
  { keys: '← / →', desc: '快退 / 快进 5 秒' },
  { keys: '↑ / ↓', desc: '音量增减' },
  { keys: 'M', desc: '静音' },
  { keys: 'F', desc: '全屏' },
  { keys: 'W', desc: '网页全屏' },
  { keys: 'P', desc: '画中画' },
  { keys: 'Esc', desc: '退出全屏 / 关闭弹层' },
  { keys: 'Shift + ← / →', desc: '上一集 / 下一集（影视）' },
];

function toast(
  title: string,
  description?: string,
  variant: 'success' | 'info' | 'warning' | 'error' = 'success',
): void {
  void import('@/components/shared/AppToasts').then((m) => {
    m.showAppToast({ title, description, variant });
  });
}

function getVideoEl(art: Artplayer): HTMLVideoElement | null {
  try {
    return (art.template as { $video?: HTMLVideoElement }).$video ?? null;
  } catch {
    return null;
  }
}

function applyColorFilter(art: Artplayer): void {
  const state = colorByArt.get(art) ?? DEFAULT_COLOR;
  const video = getVideoEl(art);
  if (!video) return;
  const { brightness, contrast, saturate, hue } = state;
  const isDefault =
    brightness === 100 && contrast === 100 && saturate === 100 && hue === 0;
  video.style.filter = isDefault
    ? ''
    : `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg)`;
}

function appendPreciseJump(url: string, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  if (!url || t <= 0) return url;
  try {
    if (/^https?:\/\//i.test(url)) {
      const u = new URL(url);
      u.searchParams.set('t', String(t));
      return u.toString();
    }
  } catch {
    /* */
  }
  const base = url.split('#')[0] ?? url;
  return `${base}#t=${t}`;
}

function removeDefaultMenus(art: Artplayer): void {
  for (const name of DEFAULT_NAMES) {
    try {
      art.contextmenu.remove(name);
    } catch {
      /* */
    }
  }
}

function closePanel(art: Artplayer): void {
  try {
    art.layers.remove(PANEL_LAYER);
  } catch {
    /* */
  }
  getArtplayerIdleChrome()?.unpin();
}

function openPanel(
  art: Artplayer,
  title: string,
  buildBody: (body: HTMLElement, close: () => void) => void,
): void {
  closePanel(art);
  getArtplayerIdleChrome()?.pin();

  const root = document.createElement('div');
  root.className = 'reader-art-ctx-panel';
  root.addEventListener('click', (e) => e.stopPropagation());
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const head = document.createElement('div');
  head.className = 'reader-art-ctx-panel-head';
  const titleEl = document.createElement('div');
  titleEl.className = 'reader-art-ctx-panel-title';
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'reader-art-ctx-panel-close';
  closeBtn.textContent = '关闭';
  const doClose = () => closePanel(art);
  closeBtn.addEventListener('click', doClose);
  head.append(titleEl, closeBtn);

  const body = document.createElement('div');
  body.className = 'reader-art-ctx-panel-body';
  buildBody(body, doClose);

  root.append(head, body);

  art.layers.add({
    name: PANEL_LAYER,
    html: root,
    style: {
      position: 'absolute',
      inset: '0',
      zIndex: '130',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'auto',
      background: 'rgba(0,0,0,0.35)',
    },
  });
  art.layers.show = true;

  // 点遮罩关闭
  const layerHost = (
    art.template as { $player?: HTMLElement }
  ).$player?.querySelector(`[data-name="${PANEL_LAYER}"]`) as HTMLElement | null;
  layerHost?.addEventListener('click', (e) => {
    if (e.target === layerHost) doClose();
  });
}

function openColorPanel(art: Artplayer): void {
  const state = { ...(colorByArt.get(art) ?? DEFAULT_COLOR) };
  colorByArt.set(art, state);

  openPanel(art, '视频色彩调整', (body) => {
    const rows: Array<{
      key: keyof ColorState;
      label: string;
      min: number;
      max: number;
      unit: string;
    }> = [
      { key: 'brightness', label: '亮度', min: 50, max: 150, unit: '%' },
      { key: 'contrast', label: '对比度', min: 50, max: 150, unit: '%' },
      { key: 'saturate', label: '饱和度', min: 0, max: 200, unit: '%' },
      { key: 'hue', label: '色相', min: -180, max: 180, unit: '°' },
    ];

    for (const row of rows) {
      const wrap = document.createElement('label');
      wrap.className = 'reader-art-ctx-slider-row';
      const top = document.createElement('div');
      top.className = 'reader-art-ctx-slider-meta';
      const name = document.createElement('span');
      name.textContent = row.label;
      const val = document.createElement('span');
      val.textContent = `${state[row.key]}${row.unit}`;
      top.append(name, val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(row.min);
      input.max = String(row.max);
      input.value = String(state[row.key]);
      input.addEventListener('input', () => {
        state[row.key] = Number(input.value);
        colorByArt.set(art, { ...state });
        val.textContent = `${state[row.key]}${row.unit}`;
        applyColorFilter(art);
      });
      wrap.append(top, input);
      body.append(wrap);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'reader-art-ctx-panel-action';
    reset.textContent = '恢复默认';
    reset.addEventListener('click', () => {
      Object.assign(state, DEFAULT_COLOR);
      colorByArt.set(art, { ...DEFAULT_COLOR });
      applyColorFilter(art);
      body.querySelectorAll('input[type="range"]').forEach((el, i) => {
        const row = rows[i];
        if (!row || !(el instanceof HTMLInputElement)) return;
        el.value = String(state[row.key]);
        const meta = el.previousElementSibling?.querySelector('span:last-child');
        if (meta) meta.textContent = `${state[row.key]}${row.unit}`;
      });
    });
    body.append(reset);
  });
}

function openAudioPanel(art: Artplayer): void {
  openPanel(art, '视频音效调节', (body) => {
    const hint = document.createElement('p');
    hint.className = 'reader-art-ctx-hint';
    hint.textContent = '均衡器预置；增强 / 外置播放时生效';
    body.append(hint);

    const row = document.createElement('div');
    row.className = 'reader-art-ctx-chip-row';
    const cur = () => getVideoPlaybackPrefs().audioEqPreset;

    const labelOf = (preset: AudioEqPreset): string => {
      if (preset === 'off') return '关闭';
      if (preset === 'bass') return '低音';
      if (preset === 'treble') return '高音';
      return '人声';
    };

    const render = () => {
      row.replaceChildren();
      for (const preset of AUDIO_EQ_PRESET_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reader-art-ctx-chip';
        btn.dataset.active = String(cur() === preset);
        btn.textContent = labelOf(preset);
        btn.addEventListener('click', () => {
          setVideoPlaybackPrefs({ audioEqPreset: preset });
          render();
          toast(
            '音效已更新',
            preset === 'off' ? '已关闭均衡器' : `已选：${labelOf(preset)}`,
          );
        });
        row.append(btn);
      }
    };
    render();
    body.append(row);
  });
}

function openHotkeyPanel(art: Artplayer): void {
  openPanel(art, '快捷键说明', (body) => {
    const list = document.createElement('div');
    list.className = 'reader-art-ctx-hotkeys';
    for (const item of HOTKEY_ROWS) {
      const row = document.createElement('div');
      row.className = 'reader-art-ctx-hotkey-row';
      const k = document.createElement('kbd');
      k.textContent = item.keys;
      const d = document.createElement('span');
      d.textContent = item.desc;
      row.append(k, d);
      list.append(row);
    }
    body.append(list);
  });
}

async function copyPreciseUrl(art: Artplayer): Promise<void> {
  let url = '';
  try {
    url = String(art.url || '').trim();
  } catch {
    /* */
  }
  if (!url) {
    const video = getVideoEl(art);
    url = (video?.currentSrc || video?.src || '').trim();
  }
  if (!url) {
    toast('无播放地址', undefined, 'error');
    return;
  }
  let t = 0;
  try {
    t = art.currentTime || 0;
  } catch {
    /* */
  }
  const text = appendPreciseJump(url, t);
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制视频地址', t > 0 ? `含进度 ${Math.floor(t)}s（精准空降）` : undefined);
  } catch (e) {
    toast('复制失败', e instanceof Error ? e.message : String(e), 'error');
  }
}

function showUpdateHistory(): void {
  const ver = packageInfo.version || '0.0.0';
  toast('MediaBox / Reader', `当前版本 ${ver}`, 'info');
}

export function attachReaderContextMenu(art: Artplayer): () => void {
  removeDefaultMenus(art);

  const versionLabel = `更新历史 ${packageInfo.version || '0.0.0'}`;

  art.contextmenu.add({
    name: 'reader-copy-url',
    index: 10,
    html: '复制视频地址 (精准空降)',
    click: (menu) => {
      menu.show = false;
      void copyPreciseUrl(art);
    },
  });

  art.contextmenu.add({
    name: 'reader-color',
    index: 20,
    html: '视频色彩调整',
    click: (menu) => {
      menu.show = false;
      openColorPanel(art);
    },
  });

  art.contextmenu.add({
    name: 'reader-audio-eq',
    index: 30,
    html: '视频音效调节',
    click: (menu) => {
      menu.show = false;
      openAudioPanel(art);
    },
  });

  art.contextmenu.add({
    name: 'reader-hotkeys',
    index: 40,
    html: '快捷键说明',
    click: (menu) => {
      menu.show = false;
      openHotkeyPanel(art);
    },
  });

  art.contextmenu.add({
    name: 'reader-changelog',
    index: 50,
    html: versionLabel,
    click: (menu) => {
      menu.show = false;
      showUpdateHistory();
    },
  });

  art.contextmenu.add({
    name: 'reader-stats',
    index: 60,
    html: '视频统计信息',
    click: (menu) => {
      menu.show = false;
      try {
        art.info.show = true;
      } catch {
        /* */
      }
    },
  });

  // 换源后视频节点可能重建，重涂滤镜
  const onReady = () => applyColorFilter(art);
  art.on('ready', onReady);
  art.on('video:loadedmetadata', onReady);

  return () => {
    art.off('ready', onReady);
    art.off('video:loadedmetadata', onReady);
    closePanel(art);
    for (const name of [
      'reader-copy-url',
      'reader-color',
      'reader-audio-eq',
      'reader-hotkeys',
      'reader-changelog',
      'reader-stats',
    ]) {
      try {
        art.contextmenu.remove(name);
      } catch {
        /* */
      }
    }
  };
}
