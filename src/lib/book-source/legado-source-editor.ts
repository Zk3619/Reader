/**
 * 书源编辑：Legado JSON 形态 ↔ Reader BookSource / 数据库
 * 对齐 Legado Max BookSourceEditActivity / web sourceStore
 */

import type { BookSource, NewBookSource } from '@/types';
import type {
  SearchRule,
  ExploreRule,
  BookInfoRule,
  TocRule,
  ContentRule,
} from '@/types/rule';
import * as sourcesDb from '@/lib/database/sources';
import { purgeBookSourceSession } from '@/lib/book-source/purge-source-session';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { autoCompleteRule } from '@/lib/book-source/rule-complete';
import type { BookSourceEditField } from '@/lib/book-source/book-source-edit-config';

const AUTO_COMPLETE_STORAGE_KEY = 'reader_book_source_edit_auto_complete';

export function readBookSourceAutoCompleteEnabled(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_COMPLETE_STORAGE_KEY);
    if (stored === null) return false;
    return stored !== '0';
  } catch {
    return false;
  }
}

export function writeBookSourceAutoCompleteEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_COMPLETE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ruleComplete(
  rule: string | undefined,
  preRule: string | undefined,
  type = 1,
  enabled: boolean,
): string | undefined {
  if (!enabled || !rule?.trim()) return rule;
  return autoCompleteRule(rule, preRule, type) ?? rule;
}

/** 保存前规则补全（对齐 BookSourceEditActivity.getSource + ruleComplete） */
export function applyRuleCompleteToLegadoEdit(
  edit: LegadoEditSource,
  enabled: boolean,
): LegadoEditSource {
  if (!enabled) return edit;
  const next = JSON.parse(JSON.stringify(edit)) as LegadoEditSource;
  const sr = { ...next.ruleSearch };
  const er = { ...next.ruleExplore };
  const ir = { ...next.ruleBookInfo };
  const tr = { ...next.ruleToc };
  const cr = { ...next.ruleContent };

  sr.bookList = ruleComplete(sr.bookList, undefined, 1, true);
  sr.name = ruleComplete(sr.name, sr.bookList, 1, true);
  sr.author = ruleComplete(sr.author, sr.bookList, 1, true);
  sr.kind = ruleComplete(sr.kind, sr.bookList, 1, true);
  sr.intro = ruleComplete(sr.intro, sr.bookList, 1, true);
  sr.wordCount = ruleComplete(sr.wordCount, sr.bookList, 1, true);
  sr.lastChapter = ruleComplete(sr.lastChapter, sr.bookList, 1, true);
  sr.coverUrl = ruleComplete(sr.coverUrl, sr.bookList, 3, true);
  sr.bookUrl = ruleComplete(sr.bookUrl, sr.bookList, 2, true);

  er.bookList = ruleComplete(er.bookList, undefined, 1, true);
  er.name = ruleComplete(er.name, er.bookList, 1, true);
  er.author = ruleComplete(er.author, er.bookList, 1, true);
  er.kind = ruleComplete(er.kind, er.bookList, 1, true);
  er.intro = ruleComplete(er.intro, er.bookList, 1, true);
  er.wordCount = ruleComplete(er.wordCount, er.bookList, 1, true);
  er.lastChapter = ruleComplete(er.lastChapter, er.bookList, 1, true);
  er.coverUrl = ruleComplete(er.coverUrl, er.bookList, 3, true);
  er.bookUrl = ruleComplete(er.bookUrl, er.bookList, 2, true);

  ir.init = ruleComplete(ir.init, undefined, 1, true);
  ir.name = ruleComplete(ir.name, ir.init, 1, true);
  ir.author = ruleComplete(ir.author, ir.init, 1, true);
  ir.kind = ruleComplete(ir.kind, ir.init, 1, true);
  ir.intro = ruleComplete(ir.intro, ir.init, 1, true);
  ir.wordCount = ruleComplete(ir.wordCount, ir.init, 1, true);
  ir.lastChapter = ruleComplete(ir.lastChapter, ir.init, 1, true);
  ir.coverUrl = ruleComplete(ir.coverUrl, ir.init, 3, true);
  ir.tocUrl = ruleComplete(ir.tocUrl, ir.init, 2, true);
  ir.downloadUrls = ruleComplete(ir.downloadUrls, ir.init, 1, true);

  tr.chapterList = ruleComplete(tr.chapterList, undefined, 1, true);
  tr.chapterName = ruleComplete(tr.chapterName, tr.chapterList, 1, true);
  tr.chapterUrl = ruleComplete(tr.chapterUrl, tr.chapterList, 2, true);
  tr.nextTocUrl = ruleComplete(tr.nextTocUrl, tr.chapterList, 2, true);

  cr.content = ruleComplete(cr.content, undefined, 1, true);
  cr.nextContentUrl = ruleComplete(cr.nextContentUrl, undefined, 2, true);
  cr.subContent = ruleComplete(cr.subContent, undefined, 1, true);
  cr.title = ruleComplete(cr.title, undefined, 1, true);

  next.ruleSearch = sr;
  next.ruleExplore = er;
  next.ruleBookInfo = ir;
  next.ruleToc = tr;
  next.ruleContent = cr;
  return next;
}

/** 编辑态 → 运行时 BookSource（未落库） */
export function legadoEditToBookSource(edit: LegadoEditSource): BookSource {
  const nb = legadoEditToNewBookSource(edit);
  return {
    ...nb,
    sourceUrl: nb.sourceUrl,
    sourceName: nb.sourceName,
    sourceType: edit.bookSourceType,
    customOrder: edit.customOrder,
    enabled: edit.enabled,
    enableExplore: edit.enabledExplore,
    lastUpdateTime: edit.lastUpdateTime,
    respondTime: edit.respondTime,
    weight: edit.weight,
    eventListener: edit.eventListener,
    customButton: edit.customButton,
    nextPageLazyLoad: edit.nextPageLazyLoad,
  };
}

/** 编辑态书源（Legado 3.x JSON 字段名） */
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
  ruleExplore: ExploreRule;
  searchUrl?: string;
  ruleSearch: SearchRule;
  ruleBookInfo: BookInfoRule;
  ruleToc: TocRule;
  ruleContent: ContentRule;
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

const EMPTY_RULES = {
  ruleSearch: {} as SearchRule,
  ruleExplore: {} as ExploreRule,
  ruleBookInfo: {} as BookInfoRule,
  ruleToc: {} as TocRule,
  ruleContent: {} as ContentRule,
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

export function bookSourceToLegadoEdit(source: BookSource): LegadoEditSource {
  return {
    bookSourceUrl: source.sourceUrl,
    bookSourceName: source.sourceName,
    bookSourceGroup: source.sourceGroup,
    bookSourceType: source.sourceType,
    bookUrlPattern: source.bookUrlPattern,
    customOrder: source.customOrder,
    enabled: source.enabled,
    enabledExplore: source.enableExplore,
    loginCheckJs: source.loginCheckJs,
    coverDecodeJs: source.coverDecodeJs,
    bookSourceComment: source.sourceComment,
    variableComment: source.variableComment,
    lastUpdateTime: source.lastUpdateTime,
    respondTime: source.respondTime,
    weight: source.weight,
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

/** 转为可导出的 Legado JSON 对象 */
export function legadoEditToExportObject(edit: LegadoEditSource): Record<string, unknown> {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(edit));
  pruneEmptyStrings(out);
  return out;
}

export function serializeLegadoEditSource(edit: LegadoEditSource): string {
  return JSON.stringify(legadoEditToExportObject(edit), null, 2);
}

export function legadoEditToNewBookSource(edit: LegadoEditSource): NewBookSource {
  const json = JSON.stringify(legadoEditToExportObject(edit));
  const parsed = parseBookSourceJson(json);
  if (parsed.length === 0) {
    throw new Error('源名称和源域名不能为空');
  }
  const item = parsed[0];
  return {
    ...item,
    lastUpdateTime: edit.lastUpdateTime || Date.now(),
    respondTime: edit.respondTime ?? 180000,
    weight: edit.weight ?? 0,
    customOrder: edit.customOrder ?? 0,
    eventListener: edit.eventListener,
    customButton: edit.customButton,
    nextPageLazyLoad: edit.nextPageLazyLoad,
  };
}

export function parseLegadoEditFromText(text: string): LegadoEditSource {
  const parsed = parseBookSourceJson(text);
  if (parsed.length === 0) {
    throw new Error('无法解析书源 JSON，请检查格式');
  }
  const raw = parsed[0] as BookSource;
  const asBook: BookSource = {
    ...raw,
    sourceType: Number(raw.sourceType ?? 0),
    customOrder: Number(raw.customOrder ?? 0),
    enabled: raw.enabled !== false,
    enableExplore: raw.enableExplore !== false,
    lastUpdateTime: Number(raw.lastUpdateTime ?? Date.now()),
    respondTime: Number(raw.respondTime ?? 180000),
    weight: Number(raw.weight ?? 0),
    enabledCookieJar: raw.enabledCookieJar !== false,
    eventListener: Boolean(raw.eventListener),
    customButton: Boolean(raw.customButton),
    nextPageLazyLoad: Boolean(raw.nextPageLazyLoad),
  };
  return bookSourceToLegadoEdit(asBook);
}

export async function loadLegadoEditSource(sourceUrl: string): Promise<LegadoEditSource> {
  const source = await sourcesDb.getSource(sourceUrl);
  if (!source) {
    throw new Error('书源不存在');
  }
  return bookSourceToLegadoEdit(source);
}

/**
 * 保存书源（新建或更新；URL 变更时删除旧记录）
 * 对齐 Legado BookSourceEditViewModel.save
 */
export async function saveLegadoEditSource(
  edit: LegadoEditSource,
  originalUrl?: string,
  options?: { autoComplete?: boolean },
): Promise<BookSource> {
  const url = edit.bookSourceUrl.trim();
  const name = edit.bookSourceName.trim();
  if (!url || !name) {
    throw new Error('源名称和源域名不能为空');
  }

  const autoComplete = options?.autoComplete ?? readBookSourceAutoCompleteEnabled();
  const prepared = applyRuleCompleteToLegadoEdit(
    { ...edit, bookSourceUrl: url, bookSourceName: name },
    autoComplete,
  );

  const normalized = legadoEditToNewBookSource({
    ...prepared,
    lastUpdateTime: Date.now(),
  });

  if (originalUrl && originalUrl !== normalized.sourceUrl) {
    const previous = await sourcesDb.getSource(originalUrl);
    if (previous) {
      await purgeBookSourceSession(previous);
    } else {
      await purgeBookSourceSession({
        sourceUrl: originalUrl,
        bookSourceUrl: originalUrl,
      } as BookSource);
    }
    await sourcesDb.deleteSource(originalUrl);
  }

  await sourcesDb.insertSource(normalized);
  window.dispatchEvent(new CustomEvent('sources-refresh'));

  const saved = await sourcesDb.getSource(normalized.sourceUrl);
  if (!saved) {
    throw new Error('保存后未能读取书源');
  }
  return saved;
}

export function getEditFieldValue(
  source: LegadoEditSource,
  field: BookSourceEditField
): string | number | boolean | undefined {
  if (field.namespace) {
    const ns = source[field.namespace as keyof LegadoEditSource] as
      | Record<string, unknown>
      | undefined;
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
  value: string | number | boolean
): void {
  if (field.namespace) {
    const key = field.namespace as keyof LegadoEditSource;
    const ns = { ...((source[key] as Record<string, unknown>) ?? {}) };
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

export function legadoEditEquals(a: LegadoEditSource, b: LegadoEditSource): boolean {
  return legadoEditSnapshot(a) === legadoEditSnapshot(b);
}
