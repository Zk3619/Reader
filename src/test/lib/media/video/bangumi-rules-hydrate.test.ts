/**
 * 番剧规则 SQLite hydrate / 恢复：避免空 LS 回退盖住 DB，以及 flag 后空库可从 bak 回填
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBangumiRules = vi.fn(async () => [] as unknown[]);
const countBangumiRules = vi.fn(async () => 0);
const replaceAllBangumiRules = vi.fn(async (_rules: unknown[]) => undefined);
const listEnabledBangumiRuleSubUrls = vi.fn(async () => [] as string[]);
const getBangumiPrefJson = vi.fn(async () => null);
const setBangumiPrefJson = vi.fn(async () => undefined);
const countBangumiRuleSubs = vi.fn(async () => 0);
const replaceAllBangumiRuleSubs = vi.fn(async () => undefined);

vi.mock('@/lib/media/video/bangumi/db/rules-dao', () => ({
  listBangumiRules,
  countBangumiRules,
  replaceAllBangumiRules,
}));

vi.mock('@/lib/media/video/bangumi/db/subs-dao', () => ({
  listEnabledBangumiRuleSubUrls,
  countBangumiRuleSubs,
  replaceAllBangumiRuleSubs,
}));

vi.mock('@/lib/media/video/bangumi/db/prefs-dao', () => ({
  BANGUMI_PREF_KEYS: { module: 'module', meta: 'meta' },
  getBangumiPrefJson,
  setBangumiPrefJson,
}));

vi.mock('@/lib/media/tv/play/tv-play-prefs', () => ({
  getTvPlayPrefs: () => ({ danmakuEnabled: false }),
  setTvPlayPrefsSilent: () => undefined,
}));

vi.mock('@/lib/media/video/bangumi/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/video/bangumi/prefs')>();
  return {
    ...actual,
    normalizeModulePrefs: (p: unknown) => actual.normalizeModulePrefs(p ?? {}),
  };
});

vi.mock('@/lib/media/video/bangumi/meta/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/video/bangumi/meta/prefs')>();
  return {
    ...actual,
    normalizeMetaPrefs: (p: unknown) => actual.normalizeMetaPrefs(p ?? {}),
  };
});

const memoryStore = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memoryStore.set(k, String(v));
  },
  removeItem: (k: string) => {
    memoryStore.delete(k);
  },
  clear: () => memoryStore.clear(),
};
vi.stubGlobal('localStorage', localStorageMock);

const sampleRule = {
  id: 'kz_gugu3_https_www_gugu3_com_',
  name: 'gugu3',
  baseUrl: 'https://www.gugu3.com/',
  enabled: true,
  version: 2 as const,
};

describe('ensureBangumiSqliteMigrated rules restore', () => {
  beforeEach(async () => {
    vi.resetModules();
    memoryStore.clear();
    listBangumiRules.mockReset();
    countBangumiRules.mockReset();
    replaceAllBangumiRules.mockReset();
    listEnabledBangumiRuleSubUrls.mockReset().mockResolvedValue([]);
    getBangumiPrefJson.mockReset().mockResolvedValue(null);
    setBangumiPrefJson.mockReset();
    countBangumiRuleSubs.mockReset().mockResolvedValue(0);
    replaceAllBangumiRuleSubs.mockReset();

    const { resetBangumiSqliteCacheForTests } = await import(
      '@/lib/media/video/bangumi/db/migrate-ls'
    );
    resetBangumiSqliteCacheForTests();
  }, 20_000);

  it('hydrates rules from DB even when LS is empty', async () => {
    countBangumiRules.mockResolvedValue(1);
    listBangumiRules.mockResolvedValue([sampleRule]);

    const mod = await import('@/lib/media/video/bangumi/db/migrate-ls');
    await mod.ensureBangumiSqliteMigrated();

    expect(mod.getCachedBangumiRules()).toEqual([sampleRule]);
    expect(mod.isBangumiSqliteHydrated()).toBe(true);
    expect(replaceAllBangumiRules).not.toHaveBeenCalled();
  }, 20_000);

  it('does not abandon DB rules when hydrate prefs path fails after rules loaded', async () => {
    countBangumiRules.mockResolvedValue(1);
    listBangumiRules.mockResolvedValue([sampleRule]);
    listEnabledBangumiRuleSubUrls.mockRejectedValueOnce(new Error('subs boom'));

    const mod = await import('@/lib/media/video/bangumi/db/migrate-ls');
    await mod.ensureBangumiSqliteMigrated();

    expect(mod.getCachedBangumiRules()).toEqual([sampleRule]);
    expect(mod.isBangumiSqliteHydrated()).toBe(true);
  });

  it('restores from rules.v2.bak when flag is set and DB is empty', async () => {
    memoryStore.set('reader.bangumi.sqlite_migrated.v122', '1');
    memoryStore.set('reader.bangumi.rules.v2.bak', JSON.stringify([sampleRule]));
    countBangumiRules.mockResolvedValue(0);
    replaceAllBangumiRules.mockImplementation(async (rules: unknown[]) => {
      countBangumiRules.mockResolvedValue(rules.length);
      listBangumiRules.mockResolvedValue(rules as typeof sampleRule[]);
    });
    listBangumiRules.mockResolvedValue([]);

    const mod = await import('@/lib/media/video/bangumi/db/migrate-ls');
    await mod.ensureBangumiSqliteMigrated();

    expect(replaceAllBangumiRules).toHaveBeenCalled();
    expect(mod.getCachedBangumiRules().map((r) => r.id)).toEqual([sampleRule.id]);
  });
});

describe('saveBangumiRules before hydrate', () => {
  beforeEach(async () => {
    vi.resetModules();
    memoryStore.clear();
    listBangumiRules.mockReset().mockResolvedValue([sampleRule]);
    countBangumiRules.mockReset().mockResolvedValue(1);
    replaceAllBangumiRules.mockReset().mockResolvedValue(undefined);
    listEnabledBangumiRuleSubUrls.mockReset().mockResolvedValue([]);
    getBangumiPrefJson.mockReset().mockResolvedValue(null);
    countBangumiRuleSubs.mockReset().mockResolvedValue(0);

    const { resetBangumiSqliteCacheForTests } = await import(
      '@/lib/media/video/bangumi/db/migrate-ls'
    );
    resetBangumiSqliteCacheForTests();
  });

  it('does not replaceAll with empty imported set before hydrate finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    listBangumiRules.mockImplementation(async () => {
      await gate;
      return [sampleRule];
    });
    countBangumiRules.mockResolvedValue(1);

    const migrate = await import('@/lib/media/video/bangumi/db/migrate-ls');
    const ensureP = migrate.ensureBangumiSqliteMigrated();

    const { importRulesJson } = await import('@/lib/media/video/bangumi/rules');
    expect(() => importRulesJson(JSON.stringify({ version: 2, rules: [] }))).not.toThrow();
    expect(replaceAllBangumiRules).not.toHaveBeenCalled();

    release();
    await ensureP;
    await Promise.resolve();
    await Promise.resolve();
    expect(migrate.getCachedBangumiRules()).toEqual([sampleRule]);
    expect(replaceAllBangumiRules).not.toHaveBeenCalledWith([]);
  });
});
