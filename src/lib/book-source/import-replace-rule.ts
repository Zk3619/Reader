import type { ReplaceRule } from '@/types';
import * as replaceDb from '@/lib/database/replace-rules';
import { matchesLegadoImportKind } from '@/lib/book-source/legado-import-kind';
import { isReplaceRuleValid } from '@/lib/replace-rules/replace-text';
import {
  mergeReplaceRuleForImport,
  type ImportReplaceRuleOptions,
} from '@/lib/book-source/import-replace-rule-merge';

export type { ImportReplaceRuleOptions } from '@/lib/book-source/import-replace-rule-merge';

interface LegadoReplaceItem {
  [key: string]: unknown;
  id?: number;
  name?: string;
  group?: string;
  pattern?: string;
  regex?: string;
  replacement?: string;
  scope?: string;
  useTo?: string;
  scopeTitle?: boolean;
  scopeContent?: boolean;
  excludeScope?: string;
  isEnabled?: boolean;
  enable?: boolean;
  isRegex?: boolean;
  timeoutMillisecond?: number;
  order?: number;
  sortOrder?: number;
  serialNumber?: number;
  replaceSummary?: string;
}

function readBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}

/** 对齐 Legado ReplaceAnalyzer.jsonToReplaceRule 旧版字段 */
export interface ParseReplaceRuleJsonOptions {
  /** 限定只接受替换规则项 */
  replaceRulesOnly?: boolean;
}

export function normalizeReplaceItem(
  raw: LegadoReplaceItem,
  fallbackOrder: number,
  options?: ParseReplaceRuleJsonOptions,
): Omit<ReplaceRule, 'id'> | null {
  if (options?.replaceRulesOnly !== false) {
    if (!matchesLegadoImportKind(raw, 'replaceRule')) return null;
  }

  const pattern = String(raw.pattern ?? raw.regex ?? '').trim();
  if (!pattern) return null;

  const name = String(raw.name ?? raw.replaceSummary ?? '导入规则').trim() || '导入规则';
  const scopeRaw = raw.scope ?? raw.useTo;
  const enabled = readBool(raw.isEnabled) ?? readBool(raw.enable);

  const rule: Omit<ReplaceRule, 'id'> = {
    name,
    group: raw.group != null ? String(raw.group) : undefined,
    pattern,
    replacement: String(raw.replacement ?? ''),
    scope: scopeRaw != null ? String(scopeRaw) : undefined,
    scopeTitle: Boolean(raw.scopeTitle),
    scopeContent: raw.scopeContent !== false,
    excludeScope: raw.excludeScope != null ? String(raw.excludeScope) : undefined,
    isEnabled: enabled !== false,
    isRegex: raw.isRegex !== false,
    timeoutMillisecond: Number(raw.timeoutMillisecond ?? 3000),
    order: Number(raw.order ?? raw.sortOrder ?? raw.serialNumber ?? fallbackOrder),
  };

  return isReplaceRuleValid(rule) ? rule : null;
}

export interface ReplaceRuleImportItem {
  rule: Omit<ReplaceRule, 'id'>;
  idHint?: number;
}

export function parseReplaceRuleImportItems(
  jsonText: string,
  options?: ParseReplaceRuleJsonOptions,
): ReplaceRuleImportItem[] {
  const trimmed = jsonText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : [data];
  const out: ReplaceRuleImportItem[] = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const legado = item as LegadoReplaceItem;
    const rule = normalizeReplaceItem(legado, index, options);
    if (!rule) return;
    const idHint = Number(legado.id ?? 0);
    out.push({
      rule,
      idHint: idHint > 0 ? idHint : undefined,
    });
  });
  return out;
}

export function parseReplaceRuleJson(
  jsonText: string,
  options?: ParseReplaceRuleJsonOptions,
): Omit<ReplaceRule, 'id'>[] {
  return parseReplaceRuleImportItems(jsonText, options).map((item) => item.rule);
}

/** Web API / 单条保存：兼容 Legado 旧字段与 id */
export function parseSingleReplaceRulePayload(raw: string): ReplaceRule | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as LegadoReplaceItem;
    if (!parsed || typeof parsed !== 'object') return null;
    const base = normalizeReplaceItem(parsed, 0);
    if (!base) return null;
    const id = Number(parsed.id ?? 0);
    return { ...base, id: Number.isFinite(id) ? id : 0 };
  } catch {
    return null;
  }
}

async function upsertImportedRule(
  rule: Omit<ReplaceRule, 'id'>,
  idHint?: number,
  options: ImportReplaceRuleOptions = {},
): Promise<'inserted' | 'updated' | 'skipped'> {
  if (idHint != null && idHint > 0) {
    const existing = await replaceDb.getReplaceRuleById(idHint);
    if (existing) {
      const merged = mergeReplaceRuleForImport(rule, existing, options);
      if (
        existing.pattern === merged.pattern &&
        existing.replacement === merged.replacement &&
        existing.name === merged.name &&
        (existing.group ?? '') === (merged.group ?? '') &&
        existing.isEnabled === merged.isEnabled
      ) {
        return 'skipped';
      }
      await replaceDb.updateReplaceRule({ ...existing, ...merged, id: idHint });
      return 'updated';
    }
  }
  await replaceDb.insertReplaceRule({ ...rule, id: 0 });
  return 'inserted';
}

export async function importReplaceRuleItems(
  items: ReplaceRuleImportItem[],
  options: ImportReplaceRuleOptions = {},
): Promise<number> {
  let count = 0;
  for (const { rule, idHint } of items) {
    const existing =
      idHint != null && idHint > 0 ? await replaceDb.getReplaceRuleById(idHint) : null;
    const merged = mergeReplaceRuleForImport(rule, existing, options);
    const action = await upsertImportedRule(merged, idHint, options);
    if (action !== 'skipped') count += 1;
  }
  if (count > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
  }
  return count;
}

export async function importReplaceRulesFromJson(jsonText: string): Promise<number> {
  const items = parseReplaceRuleImportItems(jsonText);
  if (items.length === 0) return 0;
  return importReplaceRuleItems(items);
}
