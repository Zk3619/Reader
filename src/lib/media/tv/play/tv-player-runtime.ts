/**
 * 影视 Artplayer 舞台托管：Full ↔ Mini 共用同一 DOM / 实例，reparent 不销毁。
 */

import type Artplayer from 'artplayer';
import { registerTvPlayer } from '@/lib/media/tv/play/player-bridge';

let stageEl: HTMLDivElement | null = null;
let art: Artplayer | null = null;
/** 当前会话源指纹（url + headers 等），用于判断是否需重建 */
let sourceKey = '';
/** 进入小窗前弹幕是否本就隐藏；null=未因小窗改过 */
let danmakuHiddenByMini: boolean | null = null;

export function getTvPlayerStageEl(): HTMLDivElement {
  if (!stageEl) {
    stageEl = document.createElement('div');
    stageEl.className =
      'reader-artplayer-stage relative h-full w-full min-h-0 flex-1 overflow-hidden bg-black';
    stageEl.setAttribute('data-tv-player-stage', '1');
  }
  return stageEl;
}

/** 将舞台挂到目标槽；parent 为 null 时仅从当前父节点卸下（保留节点） */
export function attachTvPlayerStage(parent: HTMLElement | null): void {
  const stage = getTvPlayerStageEl();
  if (!parent) {
    stage.remove();
    return;
  }
  if (stage.parentElement === parent) return;
  parent.appendChild(stage);
}

export function getTvRuntimeArt(): Artplayer | null {
  return art;
}

export function getTvRuntimeSourceKey(): string {
  return sourceKey;
}

export function hasTvPlayerSession(): boolean {
  return art != null;
}

/**
 * 登记新实例（调用方负责 create）。若已有旧实例且不是同一引用则先 destroy。
 */
export function adoptTvRuntimeArt(next: Artplayer, key: string): void {
  if (art && art !== next) {
    try {
      art.destroy(false);
    } catch {
      /* */
    }
  }
  art = next;
  sourceKey = key;
  registerTvPlayer(next);
}

export function destroyTvPlayerSession(): void {
  sourceKey = '';
  danmakuHiddenByMini = null;
  registerTvPlayer(null);
  if (art) {
    try {
      art.destroy(false);
    } catch {
      /* */
    }
    art = null;
  }
  if (stageEl) {
    stageEl.classList.remove('reader-art-danmaku-send');
    stageEl.classList.remove('reader-tv-mini-chrome');
  }
}

export function setTvPlayerMiniChrome(mini: boolean): void {
  const stage = stageEl ?? getTvPlayerStageEl();
  stage.classList.toggle('reader-tv-mini-chrome', mini);
  const instance = art;
  if (!instance) return;
  try {
    // 小窗藏底栏控件；全屏恢复
    if (mini) {
      instance.controls.show = false;
    } else {
      instance.controls.show = true;
    }
  } catch {
    /* */
  }
  // 小窗不显示弹幕：pause 队列；回全屏再按插件原可见态恢复
  try {
    const plugin = (
      instance.plugins as {
        artplayerPluginDanmuku?: {
          hide?: () => void;
          show?: () => void;
          isHide?: boolean;
        };
      }
    )?.artplayerPluginDanmuku;
    if (!plugin) return;
    if (mini) {
      if (danmakuHiddenByMini == null) {
        danmakuHiddenByMini = plugin.isHide === true;
      }
      plugin.hide?.();
    } else if (danmakuHiddenByMini != null) {
      const wasAlreadyHidden = danmakuHiddenByMini;
      danmakuHiddenByMini = null;
      if (!wasAlreadyHidden) plugin.show?.();
    }
  } catch {
    /* */
  }
}

export function buildTvPlaySourceKey(
  url: string,
  headers: Record<string, string> | undefined,
  reloadToken: number,
): string {
  const headerPart = headers
    ? Object.keys(headers)
        .sort()
        .map((k) => `${k}=${headers[k]}`)
        .join('&')
    : '';
  return `${url}\n${headerPart}\n${reloadToken}`;
}
