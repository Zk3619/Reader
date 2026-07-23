/**
 * 弹弹弹幕发送（可选；需密钥且 prefs.enableDanmakuSend）
 */

import {
  getDanDanPlayConfig,
  isDanDanPlayConfigured,
} from '@/lib/media/video/danmaku/dandanplay';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';

export function canSendDanmaku(): boolean {
  return getBangumiModulePrefs().enableDanmakuSend && isDanDanPlayConfigured();
}

/** 向弹弹提交一条弹幕；失败抛错 */
export async function sendDanDanComment(opts: {
  episodeId: number;
  time: number;
  mode: number;
  color: number;
  comment: string;
}): Promise<void> {
  if (!canSendDanmaku()) {
    throw new Error('未开启弹幕发送或未配置弹弹密钥');
  }
  const cfg = getDanDanPlayConfig();
  const url = `${cfg.apiBase.replace(/\/$/, '')}/api/v2/comment/${opts.episodeId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-AppId': cfg.appId,
      'X-AppSecret': cfg.appSecret,
    },
    body: JSON.stringify({
      time: opts.time,
      mode: opts.mode,
      color: opts.color,
      comment: opts.comment,
    }),
  });
  if (!res.ok) throw new Error(`发送失败 HTTP ${res.status}`);
}
