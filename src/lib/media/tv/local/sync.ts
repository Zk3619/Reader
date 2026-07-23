/**
 * LOCAL do=sync — 对齐 FongMi SyncDialog / Action.onSync（桌面精简）
 * mode: 0 收+发，1 只收，2 只发
 */

import * as TvDao from '../db/tv-dao';
import * as VodConfig from '../config/vod-config';
import type { TvHistoryRow, TvKeepRow } from '../types';
import { resolveProxyBaseUrl } from '../proxy/client';

export type SyncType = 'history' | 'keep';

type SyncPayload = {
  type?: string;
  mode?: string;
  force?: string;
  device?: string;
  config?: string;
  targets?: string;
  configs?: string;
};

function parseJsonArray<T>(raw?: string): T[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function mapIncomingHistory(item: Record<string, unknown>): TvHistoryRow | null {
  const key = String(item.key ?? item.id ?? '');
  if (!key) return null;
  return {
    key,
    siteKey: String(item.siteKey ?? item.site_key ?? ''),
    vodId: String(item.vodId ?? item.vod_id ?? ''),
    vodName: String(item.vodName ?? item.name ?? item.vod_name ?? key),
    vodPic: String(item.vodPic ?? item.cover_url ?? item.vod_pic ?? ''),
    flag: String(item.flag ?? item.vodFlag ?? ''),
    episode: String(item.episode ?? item.vodRemarks ?? ''),
    position: Number(item.position ?? 0),
    duration: Number(item.duration ?? 0),
    updatedAt: Number(item.updatedAt ?? item.createTime ?? Date.now()),
    cid: Number(item.cid ?? 0),
  };
}

function mapIncomingKeep(item: Record<string, unknown>): TvKeepRow | null {
  const key = String(item.key ?? item.id ?? '');
  if (!key) return null;
  const siteKey = String(item.siteKey ?? item.site_key ?? '');
  const vodId = String(item.vodId ?? item.vod_id ?? key.split('$').pop() ?? '');
  const rawKind = String(item.kind ?? (siteKey === 'bangumi' ? 'bangumi' : 'vod'));
  const kind: TvKeepRow['kind'] =
    rawKind === 'live' || rawKind === 'local' || rawKind === 'bangumi' ? rawKind : 'vod';
  return {
    key,
    siteKey,
    vodId,
    vodName: String(item.vodName ?? item.name ?? key),
    vodPic: String(item.vodPic ?? item.cover_url ?? ''),
    kind,
    cid: Number(item.cid ?? 0),
    createdAt: Number(item.createdAt ?? item.createTime ?? Date.now()),
    flag: typeof item.flag === 'string' ? item.flag : undefined,
    episode: typeof item.episode === 'string' ? item.episode : undefined,
  };
}

async function applyHistory(targets: string, force: boolean): Promise<number> {
  const list = parseJsonArray<Record<string, unknown>>(targets)
    .map(mapIncomingHistory)
    .filter((x): x is TvHistoryRow => !!x);
  if (force) await TvDao.clearHistory();
  for (const row of list) {
    await TvDao.upsertHistory(row);
  }
  return list.length;
}

async function applyKeep(targets: string, force: boolean): Promise<number> {
  const list = parseJsonArray<Record<string, unknown>>(targets)
    .map(mapIncomingKeep)
    .filter((x): x is TvKeepRow => !!x);
  if (force) await TvDao.clearKeep();
  for (const row of list) {
    await TvDao.upsertKeep(row);
  }
  return list.length;
}

async function localDeviceJson(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const base = await invoke<string>('tv_local_api_base_url');
    const res = await fetch(`${base.replace(/\/$/, '')}/device`);
    return await res.text();
  } catch {
    return JSON.stringify({ name: 'Reader', type: 'desktop' });
  }
}

async function historyTargetsJson(): Promise<string> {
  const rows = await TvDao.listHistory(500);
  return JSON.stringify(
    rows.map((h) => ({
      key: h.key,
      siteKey: h.siteKey,
      vodId: h.vodId,
      vodName: h.vodName,
      vodPic: h.vodPic,
      flag: h.flag,
      episode: h.episode,
      position: h.position,
      duration: h.duration,
      updatedAt: h.updatedAt,
      cid: h.cid,
    })),
  );
}

async function keepTargetsJson(): Promise<string> {
  const rows = await TvDao.listKeep();
  return JSON.stringify(
    rows.map((k) => ({
      key: k.key,
      siteKey: k.siteKey,
      vodId: k.vodId,
      vodName: k.vodName,
      vodPic: k.vodPic,
      kind: k.kind,
      cid: k.cid,
      createTime: k.createdAt,
      flag: k.flag,
      episode: k.episode,
    })),
  );
}

function configJson(): string {
  const url = VodConfig.getConfigUrl();
  return JSON.stringify({ url, name: 'Reader Vod', type: 0 });
}

/** 作为接收端：处理远端 POST 来的 sync */
export async function handleIncomingSync(p: SyncPayload): Promise<string> {
  const type = (p.type || 'history') as SyncType;
  const mode = p.mode || '0';
  const force = p.force === 'true';
  let received = 0;

  // mode 0/1：接收并写入
  if (mode === '0' || mode === '1') {
    if (type === 'keep') {
      received = await applyKeep(p.targets || '', force);
    } else {
      received = await applyHistory(p.targets || '', force);
    }
  }

  // mode 0/2：若带了 device，反向推送本机数据
  if ((mode === '0' || mode === '2') && p.device?.trim()) {
    try {
      const device = JSON.parse(p.device) as { ip?: string };
      const ip = String(device.ip || '').replace(/\/$/, '');
      if (ip) {
        await pushSyncToDevice({
          baseUrl: ip,
          type,
          mode: '1', // 对端只收
          force: false,
        });
      }
    } catch (e) {
      console.warn('[tv-sync] reverse push', e);
    }
  }

  return `sync ok type=${type} received=${received}`;
}

/** 作为发起端：向另一台 Reader/FongMi 推送 */
export async function pushSyncToDevice(opts: {
  baseUrl: string;
  type: SyncType;
  mode?: string;
  force?: boolean;
}): Promise<void> {
  const base = opts.baseUrl.replace(/\/$/, '');
  const mode = opts.mode ?? '0';
  const force = opts.force ? 'true' : 'false';
  const device = await localDeviceJson();
  const body = new URLSearchParams();
  body.set('device', device);
  if (opts.type === 'history') {
    body.set('config', configJson());
    body.set('targets', await historyTargetsJson());
  } else {
    body.set('targets', await keepTargetsJson());
    body.set('configs', JSON.stringify([VodConfig.getConfigUrl()].filter(Boolean)));
  }
  const url = `${base}/action?do=sync&type=${opts.type}&mode=${mode}&force=${force}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`sync HTTP ${res.status}`);
  }
}

export async function getLocalApiBase(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('tv_local_api_base_url');
  } catch {
    const proxy = await resolveProxyBaseUrl();
    return proxy.replace(/\/proxy\/?$/, '');
  }
}
