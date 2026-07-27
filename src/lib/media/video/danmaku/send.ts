/**
 * 弹幕发送：
 * 1) 已配置弹弹密钥 → 官方 comment API
 * 2) 否则若配置了 DANMU_PUSH_URL → 推到外置播放器
 *
 * 本地上屏 / 远端推送由 bangumi prefs 两项独立控制。
 */

import {
  getDanDanPlayConfig,
  isDanDanPlayConfigured,
  buildDanDanAuthHeaders,
} from '@/lib/media/video/danmaku/dandanplay';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import { getDanmuApiPrefs } from '@/lib/media/video/danmaku/danmu-api/prefs';
import { getDanmakuPrefs } from '@/lib/media/video/danmaku/danmaku-prefs';

export function isDanmakuSendLocalEnabled(): boolean {
  return getBangumiModulePrefs().enableDanmakuSendLocal === true;
}

export function isDanmakuSendRemoteEnabled(): boolean {
  return getBangumiModulePrefs().enableDanmakuSendRemote === true;
}

/** 是否显示发送框：已开弹幕且（本地或远程）至少开一项 */
export function shouldShowDanmakuEmitter(): boolean {
  if (!getDanmakuPrefs().danmakuEnabled) return false;
  return isDanmakuSendLocalEnabled() || isDanmakuSendRemoteEnabled();
}

/** 远端推送是否可用（开关 + 密钥/推送地址） */
export function canSendDanmaku(): boolean {
  if (!isDanmakuSendRemoteEnabled()) return false;
  if (isDanDanPlayConfigured()) return true;
  return Boolean(getDanmuApiPrefs().danmuPushUrl.trim());
}

/** 发送一条弹幕到远端；失败抛错 */
export async function sendDanDanComment(opts: {
  episodeId: number;
  time: number;
  mode: number;
  color: number;
  comment: string;
}): Promise<void> {
  if (!isDanmakuSendRemoteEnabled()) {
    throw new Error('未开启远程弹幕发送');
  }

  if (isDanDanPlayConfigured()) {
    const cfg = getDanDanPlayConfig();
    const apiPath = `/api/v2/comment/${opts.episodeId}`;
    const url = `${cfg.apiBase.replace(/\/$/, '')}${apiPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await buildDanDanAuthHeaders(apiPath)),
      },
      body: JSON.stringify({
        time: opts.time,
        mode: opts.mode,
        color: opts.color,
        comment: opts.comment,
      }),
    });
    if (!res.ok) throw new Error(`发送失败 HTTP ${res.status}`);
    return;
  }

  if (getDanmuApiPrefs().danmuPushUrl.trim()) {
    const { pushSingleCommentToExternal } = await import(
      '@/lib/media/video/danmaku/danmu-api'
    );
    await pushSingleCommentToExternal({
      time: opts.time,
      mode: opts.mode,
      color: opts.color,
      comment: opts.comment,
      episodeId: opts.episodeId,
    });
    return;
  }

  throw new Error('未配置弹弹密钥或 DANMU_PUSH_URL');
}
