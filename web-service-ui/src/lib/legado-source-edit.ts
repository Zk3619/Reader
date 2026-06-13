/**
 * Web 端书源编辑辅助（无数据库依赖）
 */

import type { BookSourceEditField } from '@/lib/book-source-edit-config';

type RuleRecord = Record<string, string | boolean | number | undefined>;

export interface LegadoEditSource {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceGroup?: string;
  bookSourceType: number;
  bookUrlPattern?: string;
  customOrder: number;
  enabled: boolean;
  enabledExplore: boolean;
  loginCheckJs?: string;
  coverDecodeJs?: string;
  bookSourceComment?: string;
  variableComment?: string;
  lastUpdateTime: number;
  respondTime: number;
  weight: number;
  exploreUrl?: string;
  exploreScreen?: string;
  ruleExplore: RuleRecord;
  searchUrl?: string;
  ruleSearch: RuleRecord;
  ruleBookInfo: RuleRecord;
  ruleToc: RuleRecord;
  ruleContent: RuleRecord;
  header?: string;
  loginUrl?: string;
  loginUi?: string;
  concurrentRate?: string;
  jsLib?: string;
  enabledCookieJar?: boolean;
  eventListener: boolean;
  customButton: boolean;
  nextPageLazyLoad: boolean;
}

/** API 返回的 BookSource（Reader 数据库格式） */
export interface ApiBookSource {
  sourceUrl: string;
  sourceName: string;
  sourceGroup?: string;
  sourceType?: number;
  bookSourceUrl?: string;
  bookUrlPattern?: string;
  customOrder?: number;
  enabled?: boolean;
  enableExplore?: boolean;
  loginCheckJs?: string;
  coverDecodeJs?: string;
  sourceComment?: string;
  variableComment?: string;
  lastUpdateTime?: number;
  respondTime?: number;
  weight?: number;
  exploreUrl?: string;
  exploreScreen?: string;
  ruleExplore?: RuleRecord;
  searchUrl?: string;
  ruleSearch?: RuleRecord;
  ruleBookInfo?: RuleRecord;
  ruleToc?: RuleRecord;
  ruleContent?: RuleRecord;
  header?: string;
  loginUrl?: string;
  loginUi?: string;
  concurrentRate?: string;
  jsLib?: string;
  enabledCookieJar?: boolean;
  eventListener?: boolean;
  customButton?: boolean;
  nextPageLazyLoad?: boolean;
  [key: string]: unknown;
}

const EMPTY_RULES = {
  ruleSearch: {} as RuleRecord,
  ruleExplore: {} as RuleRecord,
  ruleBookInfo: {} as RuleRecord,
  ruleToc: {} as RuleRecord,
  ruleContent: {} as RuleRecord,
};

export function createEmptyLegadoEditSource(): LegadoEditSource {
  return {
    bookSourceUrl: '',
    bookSourceName: '',
    bookSourceType: 0,
    customOrder: 0,
    enabled: true,
    enabledExplore: true,
    enabledCookieJar: true,
    lastUpdateTime: Date.now(),
    respondTime: 180000,
    weight: 0,
    eventListener: false,
    customButton: false,
    nextPageLazyLoad: false,
    ...EMPTY_RULES,
  };
}

export function apiBookSourceToLegadoEdit(source: ApiBookSource): LegadoEditSource {
  return {
    bookSourceUrl: source.sourceUrl || source.bookSourceUrl || '',
    bookSourceName: source.sourceName,
    bookSourceGroup: source.sourceGroup,
    bookSourceType: Number(source.sourceType ?? 0),
    bookUrlPattern: source.bookUrlPattern,
    customOrder: Number(source.customOrder ?? 0),
    enabled: source.enabled !== false,
    enabledExplore: source.enableExplore !== false,
    loginCheckJs: source.loginCheckJs,
    coverDecodeJs: source.coverDecodeJs,
    bookSourceComment: source.sourceComment,
    variableComment: source.variableComment,
    lastUpdateTime: Number(source.lastUpdateTime ?? Date.now()),
    respondTime: Number(source.respondTime ?? 180000),
    weight: Number(source.weight ?? 0),
    exploreUrl: source.exploreUrl,
    exploreScreen: source.exploreScreen,
    ruleExplore: { ...(source.ruleExplore ?? {}) },
    searchUrl: source.searchUrl,
    ruleSearch: { ...(source.ruleSearch ?? {}) },
    ruleBookInfo: { ...(source.ruleBookInfo ?? {}) },
    ruleToc: { ...(source.ruleToc ?? {}) },
    ruleContent: { ...(source.ruleContent ?? {}) },
    header: source.header,
    loginUrl: source.loginUrl,
    loginUi: source.loginUi,
    concurrentRate: source.concurrentRate,
    jsLib: source.jsLib,
    enabledCookieJar: source.enabledCookieJar !== false,
    eventListener: Boolean(source.eventListener),
    customButton: Boolean(source.customButton),
    nextPageLazyLoad: Boolean(source.nextPageLazyLoad),
  };
}

function pruneEmptyStrings(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === '' || value === null || value === undefined) {
      delete obj[key];
    } else if (typeof value === 'string' && !value.trim()) {
      delete obj[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      pruneEmptyStrings(value as Record<string, unknown>);
      if (Object.keys(value as object).length === 0) {
        delete obj[key];
      }
    }
  }
}

export function legadoEditToExportObject(edit: LegadoEditSource): Record<string, unknown> {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(edit));
  pruneEmptyStrings(out);
  return out;
}

export function serializeLegadoEditSource(edit: LegadoEditSource): string {
  return JSON.stringify(legadoEditToExportObject(edit), null, 2);
}

export function parseLegadoEditFromText(text: string): LegadoEditSource {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) throw new Error('无法解析书源 JSON');
  const raw = list[0] as Record<string, unknown>;
  if (typeof raw.bookSourceUrl === 'string') {
    return {
      ...createEmptyLegadoEditSource(),
      ...(raw as unknown as LegadoEditSource),
      ruleSearch: { ...(raw.ruleSearch as RuleRecord ?? {}) },
      ruleExplore: { ...(raw.ruleExplore as RuleRecord ?? {}) },
      ruleBookInfo: { ...(raw.ruleBookInfo as RuleRecord ?? {}) },
      ruleToc: { ...(raw.ruleToc as RuleRecord ?? {}) },
      ruleContent: { ...(raw.ruleContent as RuleRecord ?? {}) },
    };
  }
  return apiBookSourceToLegadoEdit(raw as ApiBookSource);
}

export function getEditFieldValue(
  source: LegadoEditSource,
  field: BookSourceEditField,
): string | number | boolean | undefined {
  if (field.namespace) {
    const ns = source[field.namespace as keyof LegadoEditSource] as RuleRecord | undefined;
    const v = ns?.[field.id];
    if (v === undefined || v === null) return undefined;
    if (field.type === 'Boolean') return Boolean(v);
    if (field.type === 'Number') return Number(v);
    return String(v);
  }
  const v = source[field.id as keyof LegadoEditSource];
  if (v === undefined || v === null) return field.type === 'String' ? '' : undefined;
  if (field.type === 'Boolean') return Boolean(v);
  if (field.type === 'Number') return Number(v);
  return String(v);
}

export function setEditFieldValue(
  source: LegadoEditSource,
  field: BookSourceEditField,
  value: string | number | boolean,
): void {
  if (field.namespace) {
    const key = field.namespace as keyof LegadoEditSource;
    const ns = { ...((source[key] as RuleRecord) ?? {}) };
    if (field.type === 'String' && typeof value === 'string' && !value.trim()) {
      delete ns[field.id];
    } else {
      ns[field.id] = value;
    }
    (source as unknown as Record<string, unknown>)[field.namespace] = ns;
    return;
  }
  (source as unknown as Record<string, unknown>)[field.id] = value;
}

export function legadoEditSnapshot(edit: LegadoEditSource): string {
  return JSON.stringify(edit);
}

export function cloneLegadoEdit(source: LegadoEditSource): LegadoEditSource {
  return JSON.parse(JSON.stringify(source)) as LegadoEditSource;
}
