/**
 * 规则订阅自动更新（对齐 Legado RuleUpdate）
 */

import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import {
  importSelectedBookSources,
  resolveBookSourcesFromNetworkUrl,
} from '@/lib/book-source/import-booksource-resolver';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { importRssSourcesFromList } from '@/lib/book-source/import-rss-batch';
import * as ruleSubsDb from '@/lib/database/rule-subs';
import type { RuleSub } from '@/types';
import { settingsStore } from '@/stores/settings';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

/** 规则订阅类型：0=书源, 1=订阅源, 2=替换规则 */
export const RULE_SUB_TYPE_BOOK = 0;
export const RULE_SUB_TYPE_RSS = 1;
export const RULE_SUB_TYPE_REPLACE = 2;

export function isRuleSubDue(sub: RuleSub, now = Date.now()): boolean {
  if (!sub.autoUpdate) return false;
  if (sub.updateInterval <= 0) return true;
  const intervalMs = sub.updateInterval * 3600 * 1000;
  return now - sub.update >= intervalMs;
}

export async function fetchRuleSubRssSources(url: string): Promise<ReturnType<typeof parseRssSourceJson>> {
  rssLog('规则订阅', '拉取订阅源 JSON', { url: url.trim().slice(0, 200) });
  const text = await fetchBookSourceJsonText(url.trim());
  const sources = parseRssSourceJson(text);
  rssLog('规则订阅', 'JSON 解析完成', { sourceCount: sources.length });
  return sources;
}

async function applyRuleSubBookUpdate(sub: RuleSub): Promise<number> {
  const { sources } = await resolveBookSourcesFromNetworkUrl(sub.url.trim());
  if (sources.length === 0) {
    rssWarn(sub.name, '规则订阅未解析到任何书源，可能是远程 JSON 格式异常或地址失效');
    return 0;
  }
  const app = settingsStore.state.app;
  const { inserted } = await importSelectedBookSources(sources, {
    keepName: app.importKeepName,
    keepGroup: app.importKeepGroup,
    keepEnable: app.importKeepEnable,
  });
  await ruleSubsDb.upsertRuleSub({ ...sub, update: Date.now() });
  return inserted;
}

async function applyRuleSubRssUpdate(sub: RuleSub): Promise<number> {
  const sources = await fetchRuleSubRssSources(sub.url);
  if (sources.length === 0) {
    rssWarn(sub.name, '规则订阅未解析到任何源，可能是远程 JSON 格式异常或地址失效');
    return 0;
  }
  const count = await importRssSourcesFromList(sources);
  await ruleSubsDb.upsertRuleSub({ ...sub, update: Date.now() });
  return count;
}

async function applyRuleSubReplaceUpdate(sub: RuleSub): Promise<number> {
  const text = await fetchBookSourceJsonText(sub.url.trim());
  const count = await importReplaceRulesFromJson(text);
  if (count === 0) {
    rssWarn(sub.name, '规则订阅未解析到任何替换规则，可能是远程 JSON 格式异常或地址失效');
    return 0;
  }
  await ruleSubsDb.upsertRuleSub({ ...sub, update: Date.now() });
  return count;
}

export async function applyRuleSubUpdate(sub: RuleSub): Promise<number> {
  rssLog(sub.name, '开始规则订阅更新', { url: sub.url.slice(0, 200), type: sub.type });
  let count = 0;
  switch (sub.type) {
    case RULE_SUB_TYPE_BOOK:
      count = await applyRuleSubBookUpdate(sub);
      break;
    case RULE_SUB_TYPE_RSS:
      count = await applyRuleSubRssUpdate(sub);
      break;
    case RULE_SUB_TYPE_REPLACE:
      count = await applyRuleSubReplaceUpdate(sub);
      break;
    default:
      rssWarn(sub.name, '未知规则订阅类型', { type: sub.type });
      return 0;
  }
  rssLog(sub.name, '规则订阅更新完成', { imported: count, type: sub.type });
  return count;
}

export async function runAutoRuleSubUpdates(): Promise<number> {
  const subs = await ruleSubsDb.getAllRuleSubs();
  const now = Date.now();
  const due = subs.filter(
    (sub) => sub.autoUpdate && sub.silentUpdate && isRuleSubDue(sub, now),
  );
  rssLog('规则订阅', `自动更新开始，待处理 ${due.length} 条`);
  let total = 0;
  for (const sub of due) {
    try {
      total += await applyRuleSubUpdate(sub);
    } catch (e) {
      rssError(sub.name, '规则订阅自动更新失败', e);
    }
  }
  rssLog('规则订阅', '自动更新结束', { imported: total });
  return total;
}
