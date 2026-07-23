/**
 * 规则仓库订阅（对标 MusicFree plugins.json）
 */

import { tvRequest } from '@/lib/media/tv/net/rules';
import { importKazumiRulesJson } from '@/lib/media/video/bangumi/kazumi-adapter';
import { getBangumiModulePrefs } from '@/lib/media/video/bangumi/prefs';
import {
  importRulesJson,
  upsertBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';

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

/** 解析订阅清单：规则数组 / {rules|plugins} / {rules:[{url}]} */
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

  // 内联规则
  try {
    if (isRecord(parsed) && Array.isArray(parsed.rules) && parsed.rules[0] && isRecord(parsed.rules[0]) && !('url' in parsed.rules[0] && !('name' in parsed.rules[0]))) {
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
    // 单条 Kazumi 插件文件
    const kz = importKazumiRulesJson(text);
    for (const r of kz.rules) upsertBangumiRule(r);
    if (kz.imported) return { imported: kz.imported, skipped: kz.skipped };
    const own = importRulesJson(text);
    return { imported: own.imported, skipped: [] };
  }

  let imported = 0;
  const skipped: string[] = [];
  for (const u of urls) {
    try {
      const body = await fetchText(u);
      const kz = importKazumiRulesJson(body);
      for (const r of kz.rules) upsertBangumiRule(r);
      imported += kz.imported;
      skipped.push(...kz.skipped);
      if (!kz.imported) {
        try {
          imported += importRulesJson(body).imported;
        } catch {
          /* */
        }
      }
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
  const urls = getBangumiModulePrefs().ruleSubscribeUrls;
  let imported = 0;
  const skipped: string[] = [];
  for (const u of urls) {
    try {
      const r = await importRulesFromSubscribeUrl(u);
      imported += r.imported;
      skipped.push(...r.skipped);
    } catch (e) {
      skipped.push(`${u}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { imported, skipped, urls: urls.length };
}

export type { BangumiRule };
