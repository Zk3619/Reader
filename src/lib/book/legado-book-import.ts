/**
 * Legado 书架/备份 JSON 中的书籍字段解析（含 readConfig.pageAnim 等）
 */

import { normalizeLegadoPageAnim } from '@/lib/book/legado-page-anim';
import type { Book, NewBook, ReadConfig } from '@/types';

function parseReadConfigField(raw: unknown): ReadConfig | undefined {
  if (raw == null) return undefined;
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else {
    return undefined;
  }

  const readConfig: ReadConfig = { ...obj } as ReadConfig;

  const pageAnim = normalizeLegadoPageAnim(obj.pageAnim);
  if (pageAnim !== undefined) {
    readConfig.pageAnim = pageAnim;
  } else {
    delete readConfig.pageAnim;
  }

  if (typeof obj.readSimulating === 'boolean') {
    readConfig.readSimulating = obj.readSimulating;
  }
  if (obj.startDate != null) {
    readConfig.startDate = String(obj.startDate).slice(0, 10);
  }
  if (obj.startChapter != null && Number.isFinite(Number(obj.startChapter))) {
    readConfig.startChapter = Number(obj.startChapter);
  }
  if (obj.dailyChapters != null && Number.isFinite(Number(obj.dailyChapters))) {
    readConfig.dailyChapters = Number(obj.dailyChapters);
  }
  if (typeof obj.useReplaceRule === 'boolean') {
    readConfig.useReplaceRule = obj.useReplaceRule;
  }
  if (typeof obj.reSegment === 'boolean') {
    readConfig.reSegment = obj.reSegment;
  }
  if (typeof obj.reverseToc === 'boolean') {
    readConfig.reverseToc = obj.reverseToc;
  }
  if (typeof obj.splitLongChapter === 'boolean') {
    readConfig.splitLongChapter = obj.splitLongChapter;
  }

  return readConfig;
}

export interface LegadoImportedBook extends NewBook {
  readConfig?: ReadConfig;
  durChapterIndex?: number;
  durChapterPos?: number;
  durChapterTitle?: string;
  totalChapterNum?: number;
  latestChapterTitle?: string;
  latestChapterTime?: number;
  lastCheckTime?: number;
  canUpdate?: boolean;
  order?: number;
  group?: number;
}

/** 从 Legado books.json / 备份条目解析书籍（含 readConfig） */
export function parseLegadoBookImportRow(row: Record<string, unknown>): LegadoImportedBook | null {
  const bookUrl = String(row.bookUrl ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!bookUrl || !name) return null;

  const readConfig = parseReadConfigField(row.readConfig);

  return {
    bookUrl,
    tocUrl: String(row.tocUrl ?? bookUrl).trim() || bookUrl,
    origin: String(row.origin ?? bookUrl).trim() || bookUrl,
    originName: String(row.originName ?? ''),
    name,
    author: row.author != null ? String(row.author) : undefined,
    kind: row.kind != null ? String(row.kind) : undefined,
    intro: row.intro != null ? String(row.intro) : undefined,
    coverUrl: row.coverUrl != null ? String(row.coverUrl) : undefined,
    charset: row.charset != null ? String(row.charset) : undefined,
    type: typeof row.type === 'number' ? row.type : Number(row.type) || 0,
    variable: row.variable != null ? String(row.variable) : undefined,
    readConfig,
    durChapterIndex:
      row.durChapterIndex != null && Number.isFinite(Number(row.durChapterIndex))
        ? Number(row.durChapterIndex)
        : undefined,
    durChapterPos:
      row.durChapterPos != null && Number.isFinite(Number(row.durChapterPos))
        ? Number(row.durChapterPos)
        : undefined,
    durChapterTitle:
      row.durChapterTitle != null ? String(row.durChapterTitle) : undefined,
    totalChapterNum:
      row.totalChapterNum != null && Number.isFinite(Number(row.totalChapterNum))
        ? Number(row.totalChapterNum)
        : undefined,
    latestChapterTitle:
      row.latestChapterTitle != null ? String(row.latestChapterTitle) : undefined,
    latestChapterTime:
      row.latestChapterTime != null && Number.isFinite(Number(row.latestChapterTime))
        ? Number(row.latestChapterTime)
        : undefined,
    lastCheckTime:
      row.lastCheckTime != null && Number.isFinite(Number(row.lastCheckTime))
        ? Number(row.lastCheckTime)
        : undefined,
    canUpdate: row.canUpdate === false || row.canUpdate === 0 ? false : undefined,
    order: row.order != null && Number.isFinite(Number(row.order)) ? Number(row.order) : undefined,
    group: row.group != null && Number.isFinite(Number(row.group)) ? Number(row.group) : undefined,
  };
}

/** insertBook 后合并 Legado 扩展字段 */
export function mergeLegadoImportedBookFields(
  base: Book,
  imported: LegadoImportedBook,
): Book {
  return {
    ...base,
    readConfig: imported.readConfig ?? base.readConfig,
    durChapterIndex: imported.durChapterIndex ?? base.durChapterIndex,
    durChapterPos: imported.durChapterPos ?? base.durChapterPos,
    durChapterTitle: imported.durChapterTitle ?? base.durChapterTitle,
    totalChapterNum: imported.totalChapterNum ?? base.totalChapterNum,
    latestChapterTitle: imported.latestChapterTitle ?? base.latestChapterTitle,
    latestChapterTime: imported.latestChapterTime ?? base.latestChapterTime,
    lastCheckTime: imported.lastCheckTime ?? base.lastCheckTime,
    canUpdate: imported.canUpdate ?? base.canUpdate,
    order: imported.order ?? base.order,
    group: imported.group ?? base.group,
  };
}
