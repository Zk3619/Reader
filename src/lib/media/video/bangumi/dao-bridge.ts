/**
 * 番剧 keep/history 与 TvDao 桥接；LS → DAO 一次性迁移
 */

import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { TvBangumiFlagMeta, TvHistoryRow, TvKeepRow } from '@/lib/media/tv/types';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import { loadBangumiFollows, saveBangumiFollows } from '@/lib/media/video/bangumi/rules';
import {
  clearBangumiHistory,
  loadBangumiHistory,
} from '@/lib/media/video/bangumi/history';

const MIGRATE_FLAG = 'reader.bangumi.dao_migrated.v1';

export function encodeBangumiFlag(meta: TvBangumiFlagMeta): string {
  try {
    return JSON.stringify({ _bg: 1, ...meta });
  } catch {
    return '';
  }
}

export function decodeBangumiFlag(flag: string | undefined | null): TvBangumiFlagMeta | null {
  const s = (flag || '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (o._bg !== 1) return null;
    return {
      ruleId: typeof o.ruleId === 'string' ? o.ruleId : undefined,
      detailUrl: typeof o.detailUrl === 'string' ? o.detailUrl : undefined,
      episodeUrl: typeof o.episodeUrl === 'string' ? o.episodeUrl : undefined,
      bgmId: typeof o.bgmId === 'number' ? o.bgmId : Number(o.bgmId) || undefined,
    };
  } catch {
    return null;
  }
}

export function bangumiKeepKey(bgmId: number | string): string {
  return `bangumi$${bgmId}`;
}

export function bangumiHistoryKey(bgmId: number | string, episodeUrl?: string): string {
  const ep = (episodeUrl || '').trim();
  return ep ? `bangumi$${bgmId}$${ep}` : `bangumi$${bgmId}`;
}

/** 从播放会话 vod_id（bangumi:123）解析 bgmId */
export function parseBangumiVodId(vodId: string | undefined | null): number | null {
  if (!vodId) return null;
  const m = String(vodId).match(/^bangumi:(\d+)$/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type BangumiPlayHistoryWriteTarget = {
  mode: 'bangumi';
  bgmId: number;
  key: string;
  siteKey: typeof BANGUMI_SITE_KEY;
  vodId: string;
  /** 播放器误用 hub.siteKey 写下的幽灵行，写入正确 key 后应删除 */
  ghostKey?: string;
};

/**
 * 番剧播放进度应写入 bangumiHistoryKey。
 * 若仍按 `${hub.siteKey}$bangumi:id` 落盘，会与 bridge 记账重复，且 sourceLine 站点错乱。
 */
export function resolveBangumiPlayHistoryWrite(input: {
  hubSiteKey: string;
  vodSiteKey?: string | null;
  vodId: string;
  episodeUrl?: string;
}): BangumiPlayHistoryWriteTarget | null {
  const bgmId =
    input.vodSiteKey === BANGUMI_SITE_KEY || input.vodSiteKey === 'bangumi'
      ? parseBangumiVodId(input.vodId) ?? (Number(String(input.vodId).replace(/\D/g, '')) || null)
      : parseBangumiVodId(input.vodId);
  if (!bgmId || bgmId <= 0) return null;
  const hub = (input.hubSiteKey || '').trim();
  const ghostKey =
    hub && hub !== BANGUMI_SITE_KEY ? `${hub}$bangumi:${bgmId}` : undefined;
  return {
    mode: 'bangumi',
    bgmId,
    key: bangumiHistoryKey(bgmId, input.episodeUrl),
    siteKey: BANGUMI_SITE_KEY,
    vodId: String(bgmId),
    ghostKey,
  };
}

/** 残留站点 key + vodId=bangumi:N 的幽灵历史行（与正式 bangumi$ 行重复） */
export function isBangumiHistoryGhostRow(row: {
  key: string;
  siteKey: string;
  vodId: string;
}): boolean {
  if (!parseBangumiVodId(row.vodId)) return false;
  if (row.key.startsWith('bangumi$')) return false;
  if (row.siteKey === BANGUMI_SITE_KEY) return false;
  return true;
}

/** 删除误写入的幽灵行；若幽灵进度更新，合并进对应 bangumi 行 */
export async function purgeBangumiHistoryGhosts(limit = 200): Promise<number> {
  const rows = await TvDao.listHistory(limit);
  const ghosts = rows.filter(isBangumiHistoryGhostRow);
  let removed = 0;
  for (const g of ghosts) {
    const bgmId = parseBangumiVodId(g.vodId);
    if (!bgmId) {
      await TvDao.removeHistory(g.key);
      removed += 1;
      continue;
    }
    const bangumiRows = rows.filter(
      (r) =>
        r.key.startsWith(`bangumi$${bgmId}`) &&
        (r.episode === g.episode || !g.episode),
    );
    const prefer =
      bangumiRows.find((r) => r.episode === g.episode) ?? bangumiRows[0];
    if (prefer && (g.position > (prefer.position ?? 0) || g.duration > (prefer.duration ?? 0))) {
      const meta = decodeBangumiFlag(prefer.flag);
      await upsertBangumiPlayHistory({
        bgmId,
        title: prefer.vodName || g.vodName,
        cover: prefer.vodPic || g.vodPic,
        episodeName: prefer.episode || g.episode,
        ruleId: meta?.ruleId,
        detailUrl: meta?.detailUrl,
        episodeUrl: meta?.episodeUrl,
        positionSec: Math.max(g.position, prefer.position ?? 0),
        durationSec: Math.max(g.duration, prefer.duration ?? 0),
      });
    } else if (!prefer && (g.position > 0 || g.episode)) {
      // 仅有幽灵行：尽量迁成正式 bangumi 行（无 episodeUrl 时用 per-title key）
      await upsertBangumiPlayHistory({
        bgmId,
        title: g.vodName,
        cover: g.vodPic,
        episodeName: g.episode,
        positionSec: g.position,
        durationSec: g.duration,
      });
    }
    await TvDao.removeHistory(g.key);
    removed += 1;
  }
  return removed;
}

export async function upsertBangumiKeep(input: {
  bgmId: number;
  title: string;
  cover?: string;
  ruleId?: string;
  detailUrl?: string;
}): Promise<void> {
  const key = bangumiKeepKey(input.bgmId);
  const row: TvKeepRow = {
    key,
    siteKey: BANGUMI_SITE_KEY,
    vodId: String(input.bgmId),
    vodName: input.title,
    vodPic: input.cover || '',
    kind: 'bangumi',
    cid: input.bgmId,
    createdAt: Date.now(),
    flag: encodeBangumiFlag({
      bgmId: input.bgmId,
      ruleId: input.ruleId,
      detailUrl: input.detailUrl,
    }),
  };
  await TvDao.upsertKeep(row);
}

export async function removeBangumiKeep(bgmId: number): Promise<void> {
  await TvDao.removeKeep(bangumiKeepKey(bgmId));
}

export async function isBangumiKept(bgmId: number): Promise<boolean> {
  const rows = await TvDao.listKeep();
  return rows.some((r) => r.kind === 'bangumi' && r.vodId === String(bgmId));
}

export async function upsertBangumiPlayHistory(input: {
  bgmId: number;
  title: string;
  cover?: string;
  episodeName?: string;
  ruleId?: string;
  detailUrl?: string;
  episodeUrl?: string;
  positionSec?: number;
  durationSec?: number;
}): Promise<void> {
  const key = bangumiHistoryKey(input.bgmId, input.episodeUrl);
  const row: TvHistoryRow = {
    key,
    siteKey: BANGUMI_SITE_KEY,
    vodId: String(input.bgmId),
    vodName: input.title,
    vodPic: input.cover || '',
    kind: 'bangumi',
    flag: encodeBangumiFlag({
      bgmId: input.bgmId,
      ruleId: input.ruleId,
      detailUrl: input.detailUrl,
      episodeUrl: input.episodeUrl,
    }),
    episode: input.episodeName || '',
    position: input.positionSec ?? 0,
    duration: input.durationSec ?? 0,
    updatedAt: Date.now(),
    cid: input.bgmId,
  };
  await TvDao.upsertHistory(row);
}

/** 一次性：localStorage follow/history → TvDao */
export async function migrateBangumiLocalStorageToDao(): Promise<{
  keeps: number;
  histories: number;
}> {
  if (typeof localStorage === 'undefined') return { keeps: 0, histories: 0 };
  if (localStorage.getItem(MIGRATE_FLAG) === '1') {
    return { keeps: 0, histories: 0 };
  }
  let keeps = 0;
  let histories = 0;
  try {
    const follows = loadBangumiFollows();
    for (const f of follows) {
      const bgmId = Number(f.id.replace(/\D/g, '')) || hashId(f.id);
      await upsertBangumiKeep({
        bgmId,
        title: f.title,
        cover: f.cover,
        ruleId: f.ruleId,
        detailUrl: f.url,
      });
      keeps += 1;
    }
    const hist = loadBangumiHistory();
    for (const h of hist) {
      const bgmId = Number(h.id.replace(/\D/g, '')) || hashId(h.id);
      await upsertBangumiPlayHistory({
        bgmId,
        title: h.title,
        cover: h.cover,
        episodeName: h.episodeName,
        ruleId: h.ruleId,
        detailUrl: h.detailUrl,
        episodeUrl: h.episodeUrl,
        positionSec: h.positionSec,
      });
      histories += 1;
    }
    saveBangumiFollows([]);
    clearBangumiHistory();
    localStorage.setItem(MIGRATE_FLAG, '1');
  } catch (e) {
    console.warn('[bangumi] migrate to dao failed', e);
  }
  return { keeps, histories };
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

export async function ensureBangumiDaoMigrated(): Promise<void> {
  const { ensureBangumiSqliteMigrated } = await import(
    '@/lib/media/video/bangumi/db/migrate-ls'
  );
  await ensureBangumiSqliteMigrated();
  await migrateBangumiLocalStorageToDao();
  await purgeBangumiHistoryGhosts(200).catch(() => 0);
}
