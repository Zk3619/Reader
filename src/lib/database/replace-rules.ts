/**
 * 替换规则数据访问对象
 * 对应 legado 项目的 ReplaceRuleDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { ReplaceRule } from '@/types';

/**
 * 获取所有替换规则
 */
export async function getAllReplaceRules(): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM replace_rules ORDER BY sortOrder ASC'
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 搜索替换规则
 */
export async function searchReplaceRules(
  keyword: string
): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM replace_rules 
     WHERE "group" LIKE '%' || ? || '%' OR name LIKE '%' || ? || '%'
     ORDER BY sortOrder ASC`,
    [keyword, keyword]
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 根据分组搜索替换规则
 */
export async function getReplaceRulesByGroup(
  groupName: string
): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM replace_rules 
     WHERE "group" LIKE '%' || ? || '%'
     ORDER BY sortOrder ASC`,
    [groupName]
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 获取未分组的替换规则
 */
export async function getNoGroupReplaceRules(): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM replace_rules 
     WHERE "group" IS NULL OR TRIM("group") = '' OR TRIM("group") LIKE '%未分组%'
     ORDER BY sortOrder ASC`
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 获取所有启用的替换规则
 */
export async function getEnabledReplaceRules(): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM replace_rules WHERE isEnabled = 1 ORDER BY sortOrder ASC'
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 根据作用范围获取启用的替换规则（用于正文）
 */
export async function getEnabledRulesByContentScope(
  name: string,
  origin: string
): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM replace_rules 
     WHERE isEnabled = 1 AND scopeContent = 1
     AND (scope LIKE '%' || ? || '%' OR scope LIKE '%' || ? || '%' OR scope IS NULL OR scope = '')
     AND (excludeScope IS NULL OR (excludeScope NOT LIKE '%' || ? || '%' AND excludeScope NOT LIKE '%' || ? || '%'))
     ORDER BY sortOrder`,
    [name, origin, name, origin]
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 根据作用范围获取启用的替换规则（用于标题）
 */
export async function getEnabledRulesByTitleScope(
  name: string,
  origin: string
): Promise<ReplaceRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM replace_rules 
     WHERE isEnabled = 1 AND scopeTitle = 1
     AND (scope LIKE '%' || ? || '%' OR scope LIKE '%' || ? || '%' OR scope IS NULL OR scope = '')
     AND (excludeScope IS NULL OR (excludeScope NOT LIKE '%' || ? || '%' AND excludeScope NOT LIKE '%' || ? || '%'))
     ORDER BY sortOrder`,
    [name, origin, name, origin]
  );
  return rows.map(row => mapRowToRule(row));
}

/**
 * 根据ID获取替换规则
 */
export async function getReplaceRuleById(id: number): Promise<ReplaceRule | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM replace_rules WHERE id = ?',
    [id]
  );
  return rows.length > 0 ? mapRowToRule(rows[0]) : null;
}

/**
 * 插入替换规则
 */
export async function insertReplaceRule(rule: ReplaceRule): Promise<number> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO replace_rules (
      name, "group", pattern, replacement, scope,
      scopeTitle, scopeContent, excludeScope,
      isEnabled, isRegex, timeoutMillisecond, sortOrder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.name,
      rule.group ?? null,
      rule.pattern,
      rule.replacement,
      rule.scope ?? null,
      rule.scopeTitle ? 1 : 0,
      rule.scopeContent ? 1 : 0,
      rule.excludeScope ?? null,
      rule.isEnabled ? 1 : 0,
      rule.isRegex ? 1 : 0,
      rule.timeoutMillisecond,
      rule.order,
    ]
  );

  // 获取插入的ID
  const rows = await db.select<{ id: number }>(
    'SELECT last_insert_rowid() as id'
  );
  return rows[0]?.id ?? 0;
}

/**
 * 更新替换规则
 */
export async function updateReplaceRule(rule: ReplaceRule): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE replace_rules SET
      name = ?, "group" = ?, pattern = ?, replacement = ?,
      scope = ?, scopeTitle = ?, scopeContent = ?, excludeScope = ?,
      isEnabled = ?, isRegex = ?, timeoutMillisecond = ?, sortOrder = ?
    WHERE id = ?`,
    [
      rule.name,
      rule.group ?? null,
      rule.pattern,
      rule.replacement,
      rule.scope ?? null,
      rule.scopeTitle ? 1 : 0,
      rule.scopeContent ? 1 : 0,
      rule.excludeScope ?? null,
      rule.isEnabled ? 1 : 0,
      rule.isRegex ? 1 : 0,
      rule.timeoutMillisecond,
      rule.order,
      rule.id,
    ]
  );
}

/**
 * 删除替换规则
 */
export async function deleteReplaceRule(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM replace_rules WHERE id = ?', [id]);
}

export async function deleteReplaceRules(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`DELETE FROM replace_rules WHERE id IN (${placeholders})`, ids);
}

export async function setReplaceRulesEnabled(ids: number[], enabled: boolean): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(
    `UPDATE replace_rules SET isEnabled = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, ...ids],
  );
}

async function getSortOrderBounds(): Promise<{ min: number; max: number }> {
  const db = await getDatabase();
  const rows = await db.select<{ minOrder: number | null; maxOrder: number | null }>(
    'SELECT MIN(sortOrder) as minOrder, MAX(sortOrder) as maxOrder FROM replace_rules',
  );
  return {
    min: Number(rows[0]?.minOrder ?? 0),
    max: Number(rows[0]?.maxOrder ?? 0),
  };
}

export async function moveReplaceRulesToTop(rules: ReplaceRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { min } = await getSortOrderBounds();
  let order = min - 1;
  for (const rule of rules) {
    await updateReplaceRule({ ...rule, order });
    order -= 1;
  }
}

export async function moveReplaceRulesToBottom(rules: ReplaceRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { max } = await getSortOrderBounds();
  let order = max + 1;
  for (const rule of rules) {
    await updateReplaceRule({ ...rule, order });
    order += 1;
  }
}

/**
 * 启用/禁用所有替换规则
 */
export async function enableAllReplaceRules(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute('UPDATE replace_rules SET isEnabled = ?', [
    enabled ? 1 : 0,
  ]);
}

/**
 * 获取所有分组
 */
export async function getAllRuleGroups(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ group: string }>(
    `SELECT DISTINCT "group" FROM replace_rules 
     WHERE "group" IS NOT NULL AND TRIM("group") != ''`
  );
  return rows.map(row => row.group).filter(Boolean);
}

/**
 * 将数据库行映射为ReplaceRule对象
 */
function mapRowToRule(row: Record<string, unknown>): ReplaceRule {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    group: row.group ? String(row.group) : undefined,
    pattern: String(row.pattern ?? ''),
    replacement: String(row.replacement ?? ''),
    scope: row.scope ? String(row.scope) : undefined,
    scopeTitle: Boolean(row.scopeTitle ?? 0),
    scopeContent: Boolean(row.scopeContent ?? 1),
    excludeScope: row.excludeScope ? String(row.excludeScope) : undefined,
    isEnabled: Boolean(row.isEnabled ?? 1),
    isRegex: Boolean(row.isRegex ?? 1),
    timeoutMillisecond: Number(row.timeoutMillisecond ?? 3000),
    order: Number(row.sortOrder ?? 0),
  };
}
