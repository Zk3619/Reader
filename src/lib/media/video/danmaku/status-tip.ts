/**
 * 播放侧可爱提示弹幕（正在获取 / 失败）
 * 不落库、不参与缓存。
 */

import type Artplayer from 'artplayer';
import { emitLocalDanmaku, getTvPlayer } from '@/lib/media/tv/play/player-bridge';
import { getArtDanmukuPlugin } from '@/lib/media/video/danmaku/art-danmuku';

export type DanmakuStatusTipKind = 'fetching' | 'error';

const TIPS: Record<DanmakuStatusTipKind, string[]> = {
  fetching: [
    '弹幕君出门找小伙伴啦～稍等一下下♡',
    '叮咚～正在召唤弹幕小精灵…',
    '稍等喔，弹幕君去取快递了～',
  ],
  error: [
    '呜…没找到弹幕小伙伴，晚点再试嘛 (｡•́︿•̀｡)',
    '弹幕君迷路了…再点一次重匹配试试喵',
    '诶嘿没捞到弹幕，先看正片也超棒的～',
  ],
};

const COLORS: Record<DanmakuStatusTipKind, string> = {
  fetching: '#ff9ec8',
  error: '#c4a1ff',
};

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!;
}

/** 向当前（或指定）Artplayer 推送状态提示弹幕 */
export function emitDanmakuStatusTip(
  kind: DanmakuStatusTipKind,
  art?: Artplayer | null,
): boolean {
  const text = pick(TIPS[kind]);
  const color = COLORS[kind];
  const player = art ?? getTvPlayer();
  if (player) {
    try {
      const plugin = getArtDanmukuPlugin(player);
      if (plugin?.emit) {
        // 不传 time → 插件用 currentTime+0.5，立刻上屏
        plugin.emit({
          text,
          color,
          border: true,
          mode: 0,
          style: {
            borderRadius: '8px',
            padding: '2px 8px',
            boxSizing: 'border-box',
          },
        });
        return true;
      }
    } catch (e) {
      console.warn('[tv-danmaku] status tip failed', e);
    }
  }
  return emitLocalDanmaku(text, { border: true, color });
}
