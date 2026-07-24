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

async function readLsRules(): Promise<BangumiRule[]> {
  if (typeof localStorage === 'undefined') return [];
  const { normalizeBangumiRule } = await import('@/lib/media/video/bangumi/rules');
  try {
    const v2 = localStorage.getItem(RULES_KEY_V2);
    if (v2) {
      const parsed = JSON.parse(v2) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.rules)
          ? parsed.rules
          : [];
      return list
        .map((item) => normalizeBangumiRule(item))
        .filter((r): r is BangumiRule => r != null);
    }
    const v1 = localStorage.getItem(RULES_KEY_V1);
    if (v1) {
      const parsed = JSON.parse(v1) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => normalizeBangumiRule(item))
        .filter((r): r is BangumiRule => r != null);
    }
  } catch {
    /* */
  }
  return [];
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
  rulesCache = await listBangumiRules();
  const urls = await listEnabledBangumiRuleSubUrls();
  const moduleRaw =
    (await getBangumiPrefJson<Partial<BangumiModulePrefs>>(BANGUMI_PREF_KEYS.module)) ?? {};
  const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
  modulePrefsCache = normalizeModulePrefs({
    ...moduleRaw,
    ruleSubscribeUrls: urls,
  });
  const metaRaw =
    (await getBangumiPrefJson<Partial<BangumiMetaPrefs>>(BANGUMI_PREF_KEYS.meta)) ?? {};
  const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
  metaPrefsCache = normalizeMetaPrefs(metaRaw);
  hydrated = true;
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
    return { rules, subs, prefs };
  }
  if (localStorage.getItem(SQLITE_MIGRATE_FLAG) === '1') {
    return { rules, subs, prefs };
  }

  const dbRuleCount = await countBangumiRules();
  const lsRules = await readLsRules();
  if (dbRuleCount === 0 && lsRules.length > 0) {
    await replaceAllBangumiRules(lsRules);
    rules = lsRules.length;
    try {
      localStorage.setItem(RULES_BACKUP_KEY, JSON.stringify(lsRules));
    } catch {
      /* */
    }
  }

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

  try {
    localStorage.setItem(SQLITE_MIGRATE_FLAG, '1');
  } catch {
    /* */
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
      await hydrateCachesFromDb();
    } catch (e) {
      console.warn('[bangumi] sqlite migrate/hydrate failed', e);
      if (!hydrated) {
        rulesCache = await readLsRules();
        const { normalizeModulePrefs } = await import('@/lib/media/video/bangumi/prefs');
        modulePrefsCache = normalizeModulePrefs(readLsModulePrefsPartial());
        const { normalizeMetaPrefs } = await import('@/lib/media/video/bangumi/meta/prefs');
        metaPrefsCache = normalizeMetaPrefs(readLsMetaPrefsPartial());
        hydrated = true;
      }
    } finally {
      migratePromise = null;
    }
  })();
  await migratePromise;
}

/** 测试/调试：重置内存状态 */
export function resetBangumiSqliteCacheForTests(): void {
  rulesCache = [];
  modulePrefsCache = null;
  metaPrefsCache = null;
  hydrated = false;
  migratePromise = null;
}
