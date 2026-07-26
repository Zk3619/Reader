/**
 * LS → SQLite 一次性迁移 + 内存缓存 hydrate
 */

import {
  BANGUMI_PREF_KEYS,
  getBangumiPrefJson,
  setBangumiPrefJson,
} from '@/lib/media/video/bangumi/db/prefs-dao';
import {
  countBangumiRules,
  listBangumiRules,
  replaceAllBangumiRules,
} from '@/lib/media/video/bangumi/db/rules-dao';
import {
  countBangumiRuleSubs,
  listEnabledBangumiRuleSubUrls,
  replaceAllBangumiRuleSubs,
} from '@/lib/media/video/bangumi/db/subs-dao';
import type { BangumiMetaPrefs } from '@/lib/media/video/bangumi/meta/prefs';
import type { BangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import type { BangumiRule } from '@/lib/media/video/bangumi/rules';

const SQLITE_MIGRATE_FLAG = 'reader.bangumi.sqlite_migrated.v122';
const RULES_KEY_V2 = 'reader.bangumi.rules.v2';
const RULES_KEY_V1 = 'reader.bangumi.rules.v1';
const RULES_BACKUP_KEY = 'reader.bangumi.rules.v2.bak';
const MODULE_PREFS_KEY = 'reader.bangumi.prefs.v1';
const META_PREFS_KEY = 'reader.bangumi.meta.prefs.v1';
const MODULE_PREFS_BACKUP = 'reader.bangumi.prefs.v1.bak';
const META_PREFS_BACKUP = 'reader.bangumi.meta.prefs.v1.bak';

let rulesCache: BangumiRule[] = [];
let modulePrefsCache: BangumiModulePrefs | null = null;
let metaPrefsCache: BangumiMetaPrefs | null = null;
let hydrated = false;
let migratePromise: Promise<void> | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function parseRulesJsonText(raw: string | null | undefined): Promise<BangumiRule[]> {
  if (!raw?.trim()) return [];
  const { normalizeBangumiRule } = await import('@/lib/media/video/bangumi/rules');
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.rules)
        ? parsed.rules
        : [];
    return list
      .map((item) => normalizeBangumiRule(item))
      .filter((r): r is BangumiRule => r != null);
  } catch {
    return [];
  }
}

/** LS v2 → v1 → v2.bak（迁移后主 key 可能已空，bak 仍可用） */
async function readLsRules(): Promise<BangumiRule[]> {
  if (typeof localStorage === 'undefined') return [];
  const fromV2 = await parseRulesJsonText(localStorage.getItem(RULES_KEY_V2));
  if (fromV2.length) return fromV2;
  const fromV1 = await parseRulesJsonText(localStorage.getItem(RULES_KEY_V1));
  if (fromV1.length) return fromV1;
  return parseRulesJsonText(localStorage.getItem(RULES_BACKUP_KEY));
}

function readLsModulePrefsPartial(): Partial<BangumiModulePrefs> & {
  ruleSubscribeUrls?: string[];
} {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MODULE_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<BangumiModulePrefs>;
  } catch {
    return {};
  }
}

function readLsMetaPrefsPartial(): Partial<BangumiMetaPrefs> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(META_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<BangumiMetaPrefs>;
  } catch {
    return {};
  }
}

export function getCachedBangumiRules(): BangumiRule[] {
  return rulesCache;
}

export function setCachedBangumiRules(rules: BangumiRule[]): void {
  rulesCache = rules;
}

export function getCachedModulePrefs(): BangumiModulePrefs | null {
  return modulePrefsCache;
}

export function setCachedModulePrefs(prefs: BangumiModulePrefs): void {
  modulePrefsCache = prefs;
}

export function getCachedMetaPrefs(): BangumiMetaPrefs | null {
  return metaPrefsCache;
}

export function setCachedMetaPrefs(prefs: BangumiMetaPrefs): void {
  metaPrefsCache = prefs;
}

export function isBangumiSqliteHydrated(): boolean {
  return hydrated;
}

async function hydrateCachesFromDb(): Promise<void> {
  // 规则必须先落 cache：后续 prefs/subs 失败时仍可保留 DB 规则
  rulesCache = await listBangumiRules();
  try {
    const urls = await listEnabledBangumiRuleSubUrls();
    const moduleRaw =
      (await getBangumiPrefJson<Partial<BangumiModulePrefs>>(BANGUMI_PREF_KEYS.module)) ?? {};
    const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
    modulePrefsCache = normalizeModulePrefs({
      ...moduleRaw,
      ruleSubscribeUrls: urls,
    });
  } catch (e) {
    console.warn('[bangumi] hydrate module prefs failed', e);
    const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
    modulePrefsCache = normalizeModulePrefs({});
  }
  try {
    const metaRaw =
      (await getBangumiPrefJson<Partial<BangumiMetaPrefs>>(BANGUMI_PREF_KEYS.meta)) ?? {};
    const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
    metaPrefsCache = normalizeMetaPrefs(metaRaw);
  } catch (e) {
    console.warn('[bangumi] hydrate meta prefs failed', e);
    const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
    metaPrefsCache = normalizeMetaPrefs({});
  }
  hydrated = true;
  // 与影视「加载弹幕」对齐，避免 bangumi 默认关但 tv-play-prefs 仍为开
  void import('@/lib/media/tv/play/tv-play-prefs').then((m) => {
    const enabled = modulePrefsCache?.danmakuEnabledByDefault === true;
    if (m.getTvPlayPrefs().danmakuEnabled === enabled) return;
    m.setTvPlayPrefsSilent({ danmakuEnabled: enabled });
  });
}

/** DB 空时从 LS/bak 回填（即使 sqlite_migrated 已置位） */
async function rescueRulesIntoSqliteIfEmpty(): Promise<number> {
  const dbRuleCount = await countBangumiRules();
  if (dbRuleCount > 0) return 0;
  const lsRules = await readLsRules();
  if (!lsRules.length) return 0;
  await replaceAllBangumiRules(lsRules);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RULES_BACKUP_KEY, JSON.stringify(lsRules));
    }
  } catch {
    /* */
  }
  return lsRules.length;
}

async function migrateLsIntoSqlite(): Promise<{
  rules: number;
  subs: number;
  prefs: boolean;
}> {
  let rules = 0;
  let subs = 0;
  let prefs = false;
  if (typeof localStorage === 'undefined') {
    // 无 LS 时仍允许后续 hydrate；不在此写 flag
    return { rules, subs, prefs };
  }

  // 即使 flag 已置位：DB 被误清空时仍尝试从 LS/bak 回填
  rules = await rescueRulesIntoSqliteIfEmpty();

  const alreadyMigrated = localStorage.getItem(SQLITE_MIGRATE_FLAG) === '1';

  const dbSubCount = await countBangumiRuleSubs();
  const lsModule = readLsModulePrefsPartial();
  const lsUrls = Array.isArray(lsModule.ruleSubscribeUrls)
    ? lsModule.ruleSubscribeUrls.filter((u): u is string => typeof u === 'string' && !!u.trim())
    : [];
  if (dbSubCount === 0 && lsUrls.length > 0) {
    await replaceAllBangumiRuleSubs(lsUrls);
    subs = lsUrls.length;
  }

  const existingModule = await getBangumiPrefJson(BANGUMI_PREF_KEYS.module);
  if (existingModule == null && Object.keys(lsModule).length > 0) {
    const { ruleSubscribeUrls: _urls, ...rest } = lsModule;
    await setBangumiPrefJson(BANGUMI_PREF_KEYS.module, rest);
    prefs = true;
    try {
      const raw = localStorage.getItem(MODULE_PREFS_KEY);
      if (raw) localStorage.setItem(MODULE_PREFS_BACKUP, raw);
    } catch {
      /* */
    }
  }

  const existingMeta = await getBangumiPrefJson(BANGUMI_PREF_KEYS.meta);
  const lsMeta = readLsMetaPrefsPartial();
  if (existingMeta == null && Object.keys(lsMeta).length > 0) {
    await setBangumiPrefJson(BANGUMI_PREF_KEYS.meta, lsMeta);
    prefs = true;
    try {
      const raw = localStorage.getItem(META_PREFS_KEY);
      if (raw) localStorage.setItem(META_PREFS_BACKUP, raw);
    } catch {
      /* */
    }
  }

  if (!alreadyMigrated) {
    try {
      localStorage.setItem(SQLITE_MIGRATE_FLAG, '1');
    } catch {
      /* */
    }
  }
  return { rules, subs, prefs };
}

/** 确保 LS 已迁入 SQLite，并 hydrate 内存缓存 */
export async function ensureBangumiSqliteMigrated(): Promise<void> {
  if (hydrated) return;
  if (migratePromise) {
    await migratePromise;
    return;
  }
  migratePromise = (async () => {
    try {
      await migrateLsIntoSqlite();
    } catch (e) {
      console.warn('[bangumi] sqlite migrate failed', e);
    }
    try {
      await hydrateCachesFromDb();
    } catch (e) {
      console.warn('[bangumi] hydrate from db failed', e);
    }
    // hydrate 失败时：优先再读一次 DB，禁止用空 LS 盖住库内规则
    if (!hydrated) {
      try {
        const fromDb = await listBangumiRules();
        if (fromDb.length > 0) {
          rulesCache = fromDb;
          const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
          modulePrefsCache = normalizeModulePrefs(readLsModulePrefsPartial());
          const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
          metaPrefsCache = normalizeMetaPrefs(readLsMetaPrefsPartial());
          hydrated = true;
          return;
        }
      } catch (e) {
        console.warn('[bangumi] listBangumiRules fallback failed', e);
      }
      rulesCache = await readLsRules();
      const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
      modulePrefsCache = normalizeModulePrefs(readLsModulePrefsPartial());
      const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
      metaPrefsCache = normalizeMetaPrefs(readLsMetaPrefsPartial());
      hydrated = true;
    }
    // hydrate 成功但库空、LS/bak 有货：再救一次并回写 cache
    if (hydrated && rulesCache.length === 0) {
      try {
        const n = await rescueRulesIntoSqliteIfEmpty();
        if (n > 0) {
          rulesCache = await listBangumiRules();
        }
      } catch (e) {
        console.warn('[bangumi] rescue empty db rules failed', e);
      }
    }
  })();
  try {
    await migratePromise;
  } finally {
    migratePromise = null;
  }
}

/** 测试/调试：重置内存状态 */
export function resetBangumiSqliteCacheForTests(): void {
  rulesCache = [];
  modulePrefsCache = null;
  metaPrefsCache = null;
  hydrated = false;
  migratePromise = null;
}
