/**
 * Legado 旧版数据导入（myBookShelf.json / myBookSource.json / myBookReplaceRule.json）
 * 对齐 legados-main ImportOldData.kt
 */

import { JSONPath } from 'jsonpath-plus';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { parseLegadoBookImportRow } from '@/lib/book/legado-book-import';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import type { NewBookSource } from '@/types';

function isOldBookSourceItem(item: Record<string, unknown>): boolean {
  return (
    typeof item.ruleSearchList === 'string'
    || typeof item.ruleBookName === 'string'
    || typeof item.ruleFindUrl === 'string'
  );
}

function toNewRule(oldRule: string | null | undefined): string | undefined {
  if (!oldRule?.trim()) return undefined;
  let newRule = oldRule;
  let reverse = false;
  let allinone = false;
  if (newRule.startsWith('-')) {
    reverse = true;
    newRule = newRule.slice(1);
  }
  if (newRule.startsWith('+')) {
    allinone = true;
    newRule = newRule.slice(1);
  }
  const upper = newRule.toUpperCase();
  if (
    !upper.startsWith('@CSS:')
    && !upper.startsWith('@XPATH:')
    && !newRule.startsWith('//')
    && !newRule.startsWith('##')
    && !newRule.startsWith(':')
    && !upper.includes('@JS:')
    && !upper.includes('<JS>')
  ) {
    if (newRule.includes('#') && !newRule.includes('##')) {
      newRule = oldRule.replace(/#/g, '##');
    }
    if (newRule.includes('|') && !newRule.includes('||')) {
      if (newRule.includes('##')) {
        const list = newRule.split('##');
        if (list[0]?.includes('|')) {
          newRule = list[0].replace(/\|/g, '||');
          for (let i = 1; i < list.length; i++) newRule += `##${list[i]}`;
        }
      } else {
        newRule = newRule.replace(/\|/g, '||');
      }
    }
    if (
      newRule.includes('&')
      && !newRule.includes('&&')
      && !newRule.includes('http')
      && !newRule.startsWith('/')
    ) {
      newRule = newRule.replace(/&/g, '&&');
    }
  }
  if (allinone) newRule = `+${newRule}`;
  if (reverse) newRule = `-${newRule}`;
  return newRule;
}

function toNewUrl(oldUrl: string | null | undefined): string | undefined {
  if (!oldUrl?.trim()) return undefined;
  let url = oldUrl;
  if (url.toLowerCase().startsWith('<js>')) {
    return url.replace(/=searchKey/g, '={{key}}').replace(/=searchPage/g, '={{page}}');
  }
  url = url.replace(/\{([^}]+)\}/g, '<$1>');
  url = url.replace(/searchKey/g, '{{key}}');
  url = url.replace(/<searchPage([-+]1)>/g, '{{page$1}}');
  url = url.replace(/searchPage([-+]1)/g, '{{page$1}}');
  url = url.replace(/searchPage/g, '{{page}}');
  return url;
}

function fromOldBookSourceItem(item: Record<string, unknown>): NewBookSource | null {
  const bookSourceUrl = String(item.bookSourceUrl ?? '').trim();
  const bookSourceName = String(item.bookSourceName ?? '').trim();
  if (!bookSourceUrl || !bookSourceName) return null;

  let content = toNewRule(String(item.ruleBookContent ?? '')) ?? '';
  if (content.startsWith('$') && !content.startsWith('$.')) {
    content = content.slice(1);
  }

  const raw: Record<string, unknown> = {
    bookSourceUrl,
    bookSourceName,
    bookSourceGroup: item.bookSourceGroup,
    loginUrl: item.loginUrl,
    loginUi: item.loginUi,
    loginCheckJs: item.loginCheckJs,
    coverDecodeJs: item.coverDecodeJs,
    bookSourceComment: item.bookSourceComment,
    bookUrlPattern: item.ruleBookUrlPattern,
    customOrder: item.serialNumber,
    enabled: item.enable ?? true,
    bookSourceType: item.bookSourceType === 'AUDIO' ? 1 : 0,
    searchUrl: toNewUrl(String(item.ruleSearchUrl ?? '')),
    exploreUrl: String(item.ruleFindUrl ?? '')
      .split(/(?:&&|\r?\n)+/)
      .map((line) => toNewUrl(line.trim()))
      .filter(Boolean)
      .join('\n'),
    ruleSearch: {
      bookList: toNewRule(String(item.ruleSearchList ?? '')),
      name: toNewRule(String(item.ruleSearchName ?? '')),
      author: toNewRule(String(item.ruleSearchAuthor ?? '')),
      intro: toNewRule(String(item.ruleSearchIntroduce ?? '')),
      kind: toNewRule(String(item.ruleSearchKind ?? '')),
      bookUrl: toNewRule(String(item.ruleSearchNoteUrl ?? '')),
      coverUrl: toNewRule(String(item.ruleSearchCoverUrl ?? '')),
      lastChapter: toNewRule(String(item.ruleSearchLastChapter ?? '')),
    },
    ruleExplore: {
      bookList: toNewRule(String(item.ruleFindList ?? '')),
      name: toNewRule(String(item.ruleFindName ?? '')),
      author: toNewRule(String(item.ruleFindAuthor ?? '')),
      intro: toNewRule(String(item.ruleFindIntroduce ?? '')),
      kind: toNewRule(String(item.ruleFindKind ?? '')),
      bookUrl: toNewRule(String(item.ruleFindNoteUrl ?? '')),
      coverUrl: toNewRule(String(item.ruleFindCoverUrl ?? '')),
      lastChapter: toNewRule(String(item.ruleFindLastChapter ?? '')),
    },
    ruleBookInfo: {
      init: toNewRule(String(item.ruleBookInfoInit ?? '')),
      name: toNewRule(String(item.ruleBookName ?? '')),
      author: toNewRule(String(item.ruleBookAuthor ?? '')),
      intro: toNewRule(String(item.ruleIntroduce ?? '')),
      kind: toNewRule(String(item.ruleBookKind ?? '')),
      coverUrl: toNewRule(String(item.ruleCoverUrl ?? '')),
      lastChapter: toNewRule(String(item.ruleBookLastChapter ?? '')),
      tocUrl: toNewRule(String(item.ruleChapterUrl ?? '')),
    },
    ruleToc: {
      chapterList: toNewRule(String(item.ruleChapterList ?? '')),
      chapterName: toNewRule(String(item.ruleChapterName ?? '')),
      chapterUrl: toNewRule(String(item.ruleContentUrl ?? '')),
      nextTocUrl: toNewRule(String(item.ruleChapterUrlNext ?? '')),
    },
    ruleContent: {
      content,
      replaceRegex: toNewRule(String(item.ruleBookContentReplace ?? '')),
      nextContentUrl: toNewRule(String(item.ruleContentUrlNext ?? '')),
    },
  };

  return parseBookSourceJson(JSON.stringify([raw]))[0] ?? null;
}

export function importOldBookSources(json: string): NewBookSource[] {
  let items: Record<string, unknown>[];
  try {
    items = JSONPath({ path: '$', json: JSON.parse(json) }) as Record<string, unknown>[];
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];

  const result: NewBookSource[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (isOldBookSourceItem(item)) {
      const converted = fromOldBookSourceItem(item);
      if (converted) result.push(converted);
    } else {
      const modern = parseBookSourceJson(JSON.stringify([item]))[0];
      if (modern) result.push(modern);
    }
  }
  return result;
}

export async function importOldBookSourcesToDb(json: string): Promise<number> {
  const sources = importOldBookSources(json);
  let count = 0;
  for (const source of sources) {
    if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;
    await sourcesDb.insertSource(source);
    count += 1;
  }
  return count;
}

export async function importOldBookshelfToDb(json: string): Promise<number> {
  let items: Record<string, unknown>[];
  try {
    items = JSONPath({ path: '$', json: JSON.parse(json) }) as Record<string, unknown>[];
  } catch {
    return 0;
  }
  if (!Array.isArray(items)) return 0;

  let count = 0;
  for (const item of items) {
    const noteUrl = String(item.noteUrl ?? '').trim();
    if (!noteUrl) continue;
    const row: Record<string, unknown> = {
      bookUrl: noteUrl,
      name: JSONPath({ path: '$.bookInfoBean.name', json: item })?.[0] ?? '',
      author: JSONPath({ path: '$.bookInfoBean.author', json: item })?.[0] ?? '',
      origin: item.tag ?? '',
      originName: JSONPath({ path: '$.bookInfoBean.origin', json: item })?.[0] ?? '',
      tocUrl: JSONPath({ path: '$.bookInfoBean.chapterUrl', json: item })?.[0] ?? noteUrl,
      coverUrl: JSONPath({ path: '$.bookInfoBean.coverUrl', json: item })?.[0],
      durChapterIndex: item.durChapter ?? 0,
      durChapterTitle: item.durChapterName,
      durChapterPos: item.durChapterPage ?? 0,
      durChapterTime: item.finalDate ?? 0,
      totalChapterNum: item.chapterListSize ?? 0,
      latestChapterTitle: item.lastChapterName,
      intro: JSONPath({ path: '$.bookInfoBean.introduce', json: item })?.[0],
      canUpdate: item.allowUpdate !== false,
      order: item.serialNumber ?? 0,
    };
    const imported = parseLegadoBookImportRow(row);
    if (!imported) continue;
    if (await booksDb.hasBook(imported.bookUrl)) continue;
    await booksDb.insertBook(imported);
    count += 1;
  }
  return count;
}

export async function importOldReplaceRulesToDb(json: string): Promise<number> {
  return importReplaceRulesFromJson(json);
}

export type LegacyImportFileKind = 'myBookShelf' | 'myBookSource' | 'myBookReplaceRule';

export async function importLegacyBackupFile(
  kind: LegacyImportFileKind,
  json: string,
): Promise<number> {
  switch (kind) {
    case 'myBookShelf':
      return importOldBookshelfToDb(json);
    case 'myBookSource':
      return importOldBookSourcesToDb(json);
    case 'myBookReplaceRule':
      return importOldReplaceRulesToDb(json);
    default:
      return 0;
  }
}

export function detectLegacyImportKind(fileName: string): LegacyImportFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.includes('mybookshelf')) return 'myBookShelf';
  if (lower.includes('mybooksource')) return 'myBookSource';
  if (lower.includes('mybookreplacerule')) return 'myBookReplaceRule';
  return null;
}
