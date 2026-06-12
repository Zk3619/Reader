/**
 * 替换规则 Web API（对齐 Legado ReplaceRuleController.kt）
 */

import * as replaceDb from '@/lib/database/replace-rules';
import { parseSingleReplaceRulePayload } from '@/lib/book-source/import-replace-rule';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import { testReplaceRule } from '@/lib/replace-rules/test-replace-rule';
import { isReplaceRuleValid } from '@/lib/replace-rules/replace-text';
import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';
import type { ReplaceRule } from '@/types';

export async function getAllReplaceRulesApi(): Promise<LegadoReturnData<string>> {
  const rules = await replaceDb.getAllReplaceRules();
  return legadoOk(JSON.stringify(rules));
}

export async function saveReplaceRuleApi(postData: string | null): Promise<LegadoReturnData<null>> {
  if (!postData?.trim()) return legadoErr('数据不能为空');
  const rule = parseSingleReplaceRulePayload(postData);
  if (!rule) return legadoErr('格式不对');
  if (!isReplaceRuleValid(rule)) return legadoErr('替换规则无效');

  if (rule.order === Number.MIN_SAFE_INTEGER || !Number.isFinite(rule.order)) {
    const all = await replaceDb.getAllReplaceRules();
    const maxOrder = all.reduce((max, r) => Math.max(max, r.order), 0);
    rule.order = maxOrder + 1;
  }

  if (rule.id > 0) {
    await replaceDb.updateReplaceRule(rule);
  } else {
    await replaceDb.insertReplaceRule({ ...rule, id: 0 });
  }
  invalidateReplaceRulesCache();
  return legadoOk(null);
}

export async function deleteReplaceRuleApi(postData: string | null): Promise<LegadoReturnData<null>> {
  if (!postData?.trim()) return legadoErr('数据不能为空');
  const rule = parseSingleReplaceRulePayload(postData);
  if (!rule?.id) return legadoErr('格式不对');
  await replaceDb.deleteReplaceRule(rule.id);
  invalidateReplaceRulesCache();
  return legadoOk(null);
}

export async function testReplaceRuleApi(postData: string | null): Promise<LegadoReturnData<string>> {
  if (!postData?.trim()) return legadoErr('数据不能为空');
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(postData) as Record<string, unknown>;
  } catch {
    return legadoErr('格式不对');
  }

  const ruleRaw = map.rule;
  let rule: ReplaceRule | null = null;
  if (typeof ruleRaw === 'string') {
    rule = parseSingleReplaceRulePayload(ruleRaw);
  } else if (ruleRaw && typeof ruleRaw === 'object') {
    rule = parseSingleReplaceRulePayload(JSON.stringify(ruleRaw));
  }
  if (!rule) return legadoErr('格式不对');
  if (!rule.pattern.trim()) return legadoErr('替换规则不能为空');

  const text = typeof map.text === 'string' ? map.text : '';
  try {
    const content = await testReplaceRule(rule, text);
    return legadoOk(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return legadoOk(msg);
  }
}
