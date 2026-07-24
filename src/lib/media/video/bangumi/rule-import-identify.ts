/**
 * 识别番剧规则 JSON（本地/网络/代码导入共用，无写入副作用）
 */

import { importKazumiRulesJson } from '@/lib/media/video/bangumi/kazumi-adapter';
import {
  loadBangumiRules,
  normalizeBangumiRule,
  type BangumiRule,
} from '@/lib/media/video/bangumi/rules';

export type IdentifiedBangumiRule = {
  key: string;
  rule: BangumiRule;
  sourceLabel: string;
};

export type BangumiRuleImportComparison = {
  key: string;
  rule: BangumiRule;
  sourceLabel: string;
  isNew: boolean;
  isUpdate: boolean;
  existingName?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 无副作用解析 */
export function parseBangumiRulesFromTextPure(text: string): {
  rules: BangumiRule[];
  skipped: string[];
} {
  const skipped: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { rules: [], skipped };

  try {
    const kz = importKazumiRulesJson(trimmed);
    if (kz.rules.length) return { rules: kz.rules, skipped: kz.skipped };
    skipped.push(...kz.skipped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('FongMi') || msg.includes('sites')) throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('JSON 解析失败');
  }
  if (isRecord(parsed) && Array.isArray(parsed.sites)) {
    throw new Error('禁止导入 FongMi sites[]');
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (isRecord(parsed) && Array.isArray(parsed.rules)) list = parsed.rules;
  else if (
    isRecord(parsed) &&
    (parsed.baseURL || parsed.baseUrl || parsed.searchURL || parsed.name)
  ) {
    list = [parsed];
  } else {
    throw new Error('无法识别的规则包');
  }

  const rules: BangumiRule[] = [];
  for (const item of list) {
    const n = normalizeBangumiRule(item);
    if (n) rules.push(n);
    else skipped.push('无效规则条目');
  }
  return { rules, skipped };
}

export function identifyBangumiRulesFromText(
  text: string,
  sourceLabel = 'import',
): IdentifiedBangumiRule[] {
  const { rules } = parseBangumiRulesFromTextPure(text);
  return rules.map((rule) => ({
    key: rule.id || `${sourceLabel}:${rule.name}`,
    rule,
    sourceLabel,
  }));
}

export function buildBangumiRuleImportComparisons(
  identified: IdentifiedBangumiRule[],
): BangumiRuleImportComparison[] {
  const existing = loadBangumiRules();
  const byId = new Map(existing.map((r) => [r.id, r]));
  return identified.map((item) => {
    const old = byId.get(item.rule.id);
    return {
      key: item.key,
      rule: item.rule,
      sourceLabel: item.sourceLabel,
      isNew: !old,
      isUpdate: !!old,
      existingName: old?.name,
    };
  });
}

export function defaultBangumiRuleImportSelection(
  comparisons: BangumiRuleImportComparison[],
): Set<string> {
  return new Set(comparisons.filter((c) => c.isNew || c.isUpdate).map((c) => c.key));
}
