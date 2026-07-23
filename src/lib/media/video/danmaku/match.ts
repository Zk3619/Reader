/**
 * E3：弹幕匹配接线 — 弹弹优先，B 站 URL 含 BV/av 时兜底
 */

import type { Danmu } from 'artplayer-plugin-danmuku';
import {
  fetchDanDanComments,
  isDanDanPlayConfigured,
  matchDanDanByFileName,
} from '@/lib/media/video/danmaku/dandanplay';
import {
  downloadBiliDanmakuXml,
  resolveBiliCid,
} from '@/lib/media/video/danmaku/bilibili-danmaku';
import {
  biliXmlToDanmu,
  danDanCommentsToDanmu,
} from '@/lib/media/video/danmaku/to-artplayer';

export type MatchDanmakuInput = {
  /** 用于弹弹文件名匹配，如「番名 第01集」 */
  fileNameHint: string;
  /** 播放 URL，用于识别 BV/av */
  playUrl?: string;
};

export type MatchDanmakuResult = {
  source: 'dandan' | 'bilibili';
  danmu: Danmu[];
  label: string;
};

/** 尝试自动匹配并拉取弹幕；无可用源返回 null（不抛） */
export async function tryMatchDanmaku(
  input: MatchDanmakuInput,
): Promise<MatchDanmakuResult | null> {
  const hint = input.fileNameHint.trim();
  if (isDanDanPlayConfigured() && hint) {
    try {
      const matches = await matchDanDanByFileName(hint);
      const best = matches[0];
      if (best?.episodeId) {
        const raw = await fetchDanDanComments(best.episodeId);
        const danmu = danDanCommentsToDanmu(raw);
        if (danmu.length) {
          return {
            source: 'dandan',
            danmu,
            label: `${best.animeTitle} · ${best.episodeTitle}`.trim(),
          };
        }
      }
    } catch (e) {
      console.warn('[danmaku] dandan match failed', e);
    }
  }

  const biliId = extractBiliId(input.playUrl || '');
  if (biliId) {
    try {
      const pages = await resolveBiliCid(biliId);
      const cid = pages[0]?.cid;
      if (cid) {
        const xml = await downloadBiliDanmakuXml(cid);
        const danmu = biliXmlToDanmu(xml);
        if (danmu.length) {
          return {
            source: 'bilibili',
            danmu,
            label: pages[0]?.title || biliId,
          };
        }
      }
    } catch (e) {
      console.warn('[danmaku] bili match failed', e);
    }
  }

  return null;
}

function extractBiliId(url: string): string | null {
  const bv = url.match(/BV[\w]+/i);
  if (bv) return bv[0];
  const av = url.match(/\/av(\d+)/i) || url.match(/[?&]aid=(\d+)/i);
  if (av) return `av${av[1]}`;
  return null;
}
