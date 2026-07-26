/**
 * 规则仓库订阅：兼容 Kazumi index.json 目录 + MusicFree 式 URL 清单
 */

import { tvRequest } from '@/lib/media/tv/net/rules';
import { importKazumiRulesJson } from '@/lib/media/video/bangumi/kazumi-adapter';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import {
  importRulesJson,
  upsertBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';

/** 对齐 Kazumi ApiEndpoints.pluginShop */
export const KAZUMI_RULES_SHOP =
  'https://raw.githubusercontent.com/Predidit/KazumiRules/main/';

/** 对齐 Kazumi ApiEndpoints.pluginShopMirror */
export const KAZUMI_RULES_SHOP_MIRROR =
  'https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function fetchText(url: string): Promise<string> {
  const res = await tvRequest(url, {
    method: 'GET',
    useBackendHttp: true,
    timeout: 60000,
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

/** 从订阅 URL 推导仓库根（…/index.json → …/） */
export function resolveRulesShopBase(subscribeUrl: string): string {
  const u = subscribeUrl.trim();
  if (/\/index\.json(?:\?|#|$)/i.test(u)) {
    return u.replace(/\/index\.json(?:\?.*)?(?:#.*)?$/i, '/');
  }
  return ensureTrailingSlash(u);
}

/** 当前应使用的官方规则仓库根（含镜像） */
export function resolveKazumiRulesShopBase(): string {
  const { useRulesShopMirror } = getBangumiModulePrefs();
  return useRulesShopMirror ? KAZUMI_RULES_SHOP_MIRROR : KAZUMI_RULES_SHOP;
}

/**
 * 是否为 KazumiRules 风格目录：数组项含 name，无 url/searchURL/baseURL
 * （对标 PluginCatalogApi.parsePluginList）
 */
export function isKazumiRulesCatalog(parsed: unknown): boolean {
  if (!Array.isArray(parsed) || parsed.length === 0) return false;
  let named = 0;
  for (const item of parsed) {
    if (!isRecord(item)) return false;
    if (typeof item.url === 'string' || typeof item.srcUrl === 'string') return false;
    if (
      typeof item.searchURL === 'string' ||
      typeof item.baseURL === 'string' ||
      typeof item.baseUrl === 'string' ||
      typeof item.searchPath === 'string'
    ) {
      return false;
    }
    if (typeof item.name === 'string' && item.name.trim()) named += 1;
  }
  return named > 0;
}

type CatalogItem = { name: string; deprecated?: boolean };

function parseKazumiCatalogItems(parsed: unknown): CatalogItem[] {
  if (!Array.isArray(parsed)) return [];
  const out: CatalogItem[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const name = String(item.name || '').trim();
    if (!name) continue;
    if (item.deprecated === true) continue;
    out.push({ name });
  }
  return out;
}

async function importRuleBody(
  body: string,
  label: string,
): Promise<{ imported: number; skipped: string[] }> {
  const { ensureBangumiSqliteMigrated } = await import(
    '@/lib/media/video/bangumi/db/migrate-ls'
  );
  await ensureBangumiSqliteMigrated();
  const kz = importKazumiRulesJson(body);
  for (const r of kz.rules) upsertBangumiRule(r);
  if (kz.imported) return { imported: kz.imported, skipped: kz.skipped };
  try {
    const own = importRulesJson(body);
    return { imported: own.imported, skipped: kz.skipped };
  } catch (e) {
    return {
      imported: 0,
      skipped: [...kz.skipped, `${label}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

/** 按 Kazumi 方式：base + index.json → 逐条拉取 {name}.json */
export async function importRulesFromKazumiShop(baseUrl?: string): Promise<{
  imported: number;
  skipped: string[];
  catalogSize: number;
}> {
  const base = ensureTrailingSlash((baseUrl || resolveKazumiRulesShopBase()).trim());
  const indexText = await fetchText(`${base}index.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(indexText);
  } catch {
    throw new Error(`官方仓库 index.json 非 JSON: ${base}`);
  }
  if (!isKazumiRulesCatalog(parsed)) {
    throw new Error('官方仓库 index.json 格式无法识别（期望 KazumiRules 目录数组）');
  }
  const items = parseKazumiCatalogItems(parsed);
  let imported = 0;
  const skipped: string[] = [];
  for (const { name } of items) {
    const fileUrl = `${base}${name}.json`;
    try {
      const body = await fetchText(fileUrl);
      const r = await importRuleBody(body, name);
      imported += r.imported;
      skipped.push(...r.skipped);
      if (!r.imported) skipped.push(`${name}: 未识别为可导入规则`);
    } catch (e) {
      skipped.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { imported, skipped, catalogSize: items.length };
}

/** 解析订阅清单：Kazumi index / 内联规则 / URL 列表 / 单插件 */
export async function importRulesFromSubscribeUrl(url: string): Promise<{
  imported: number;
  skipped: string[];
}> {
  const text = await fetchText(url);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`清单非 JSON: ${url}`);
  }

  // KazumiRules index.json：[{ name, version, ... }]
  if (isKazumiRulesCatalog(parsed)) {
    const base = resolveRulesShopBase(url);
    const items = parseKazumiCatalogItems(parsed);
    let imported = 0;
    const skipped: string[] = [];
    for (const { name } of items) {
      const fileUrl = `${base}${name}.json`;
      try {
        const body = await fetchText(fileUrl);
        const r = await importRuleBody(body, name);
        imported += r.imported;
        skipped.push(...r.skipped);
        if (!r.imported) skipped.push(`${name}: 未识别为可导入规则`);
      } catch (e) {
        skipped.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, skipped };
  }

  // 内联规则
  try {
    if (
      isRecord(parsed) &&
      Array.isArray(parsed.rules) &&
      parsed.rules[0] &&
      isRecord(parsed.rules[0]) &&
      !('url' in parsed.rules[0] && !('name' in parsed.rules[0]))
    ) {
      const hasInline =
        isRecord(parsed.rules[0]) &&
        (typeof parsed.rules[0].baseURL === 'string' ||
          typeof parsed.rules[0].baseUrl === 'string' ||
          typeof parsed.rules[0].searchURL === 'string');
      if (hasInline) {
        const kz = importKazumiRulesJson(text);
        for (const r of kz.rules) upsertBangumiRule(r);
        if (kz.imported === 0) {
          const own = importRulesJson(text);
          return { imported: own.imported, skipped: kz.skipped };
        }
        return { imported: kz.imported, skipped: kz.skipped };
      }
    }
  } catch {
    /* fall through */
  }

  // URL 列表
  let urls: string[] = [];
  if (Array.isArray(parsed)) {
    urls = parsed
      .map((x) => (typeof x === 'string' ? x : isRecord(x) ? String(x.url || x.srcUrl || '') : ''))
      .filter(Boolean);
  } else if (isRecord(parsed)) {
    const arr = (parsed.rules || parsed.plugins) as unknown;
    if (Array.isArray(arr)) {
      urls = arr
        .map((x) =>
          typeof x === 'string' ? x : isRecord(x) ? String(x.url || x.srcUrl || '') : '',
        )
        .filter(Boolean);
    }
  }

  if (!urls.length) {
    return importRuleBody(text, url);
  }

  let imported = 0;
  const skipped: string[] = [];
  for (const u of urls) {
    try {
      const body = await fetchText(u);
      const r = await importRuleBody(body, u);
      imported += r.imported;
      skipped.push(...r.skipped);
    } catch (e) {
      skipped.push(`${u}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { imported, skipped };
}

export async function updateAllBangumiRuleSubscriptions(): Promise<{
  imported: number;
  skipped: string[];
  urls: number;
}> {
  const { upsertBangumiRuleSub } = await import('@/lib/media/video/bangumi/db/subs-dao');
  const prefs = getBangumiModulePrefs();
  const urls = [...prefs.ruleSubscribeUrls];
  // 无自定义订阅时，默认拉取官方 KazumiRules（对齐 Kazumi 内置仓库）
  if (!urls.length) {
    const shop = resolveKazumiRulesShopBase();
    const r = await importRulesFromKazumiShop(shop);
    return { imported: r.imported, skipped: r.skipped, urls: 1 };
  }
  let imported = 0;
  const skipped: string[] = [];
  for (const u of urls) {
    try {
      const r = await importRulesFromSubscribeUrl(u);
      imported += r.imported;
      skipped.push(...r.skipped);
      void upsertBangumiRuleSub(u, {
        lastFetchAt: Date.now(),
        lastError: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push(`${u}: ${msg}`);
      void upsertBangumiRuleSub(u, {
        lastFetchAt: Date.now(),
        lastError: msg,
      });
    }
  }
  return { imported, skipped, urls: urls.length };
}

export type { BangumiRule };
