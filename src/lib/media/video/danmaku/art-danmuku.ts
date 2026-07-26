/**
 * Artplayer 弹幕插件读写辅助
 */

import type Artplayer from 'artplayer';
import type { Danmu } from 'artplayer-plugin-danmuku';

export type ArtDanmukuPlugin = {
  emit?: (o: unknown) => void;
  load?: (d?: unknown) => Promise<unknown>;
  config?: (o: Record<string, unknown>) => unknown;
};

export function getArtDanmukuPlugin(art: Artplayer | null | undefined): ArtDanmukuPlugin | null {
  if (!art) return null;
  return (
    (
      art.plugins as {
        artplayerPluginDanmuku?: ArtDanmukuPlugin;
      }
    )?.artplayerPluginDanmuku ?? null
  );
}

/** 清空并载入新弹幕（load(array) 不会 reset 队列，需先 config 再 load()） */
export async function replaceArtDanmaku(
  art: Artplayer | null | undefined,
  danmu: Danmu[] | string,
): Promise<'loaded' | 'no-plugin' | 'no-art'> {
  if (!art) return 'no-art';
  const plugin = getArtDanmukuPlugin(art);
  if (!plugin?.load || !plugin.config) return 'no-plugin';
  try {
    plugin.config({ danmuku: danmu });
    await plugin.load();
    return 'loaded';
  } catch (e) {
    console.warn('[tv-danmaku] replace failed', e);
    return 'no-plugin';
  }
}

export function setArtDanmukuEmitter(
  art: Artplayer | null | undefined,
  enabled: boolean,
): void {
  const plugin = getArtDanmukuPlugin(art);
  try {
    plugin?.config?.({ emitter: enabled });
  } catch (e) {
    console.warn('[tv-danmaku] set emitter failed', e);
  }
  // 插件 config() 不会刷新 data-danmuku-emitter，需手写 dataset 才能显隐输入框
  try {
    const player = (art?.template as { $player?: HTMLElement } | undefined)?.$player;
    if (player) {
      player.dataset.danmukuEmitter = String(enabled);
    }
    const mount = document.querySelector(
      '.reader-artplayer-stage .artplayer-plugin-danmuku',
    ) as HTMLElement | null;
    const host = mount?.parentElement;
    if (host?.dataset) {
      host.dataset.danmukuEmitter = String(enabled);
    }
  } catch {
    /* */
  }
}

/** 等播放器 ready，便于弹幕层已挂好再 emit / match */
export function waitArtReady(art: Artplayer, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    try {
      if ((art as Artplayer & { isReady?: boolean }).isReady) {
        resolve();
        return;
      }
    } catch {
      /* */
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      art.once('ready', finish);
    } catch {
      finish();
      return;
    }
    setTimeout(finish, timeoutMs);
  });
}
