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
}
