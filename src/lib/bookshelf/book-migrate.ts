/**
 * 同名同作者书籍迁移（对齐 legado Book.migrateTo + BookHelp.getDurChapter）
 */

import type { Book, BookChapter } from '@/types';

const CHAPTER_NUM_PATTERN1 =
  /.*?第([\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)[章节篇回集话]/;
const CHAPTER_NUM_PATTERN2 =
  /^(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+[,:、])*([\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)(?:[,:、]|\.[^\d])/;

const PURE_NAME_STRIP =
  /^.*?第(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)[章节篇回集话](?!$)|^(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+[,:、])*(?:[\d零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+)(?:[,:、](?!$)|\.(?=[^\d]))/g;
const PURE_NAME_BRACKETS =
  /(?!^)(?:[〖【《〔\[{(][^〖【《〔\[{()〕》】〗\]}]+)?[)〕》】〗\]}]$|^[〖【《〔\[{(](?:[^〖【《〔\[{()〕》】〗\]}]+[〕》】〗\]})])?(?!$)/g;
const PURE_NAME_OTHER =
  /[^\w\u4e00-\u9fef〇\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2ebef]/g;

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const c of setA) {
    if (setB.has(c)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function getPureChapterName(title: string | undefined): string {
  if (!title) return '';
  return title
    .replace(/\s/g, '')
    .replace(PURE_NAME_STRIP, '')
    .replace(PURE_NAME_BRACKETS, '')
    .replace(PURE_NAME_OTHER, '');
}

function parseChineseNumber(raw: string): number {
  if (!raw) return -1;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const digit: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const unit: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let result = 0;
  let current = 0;
  for (const ch of raw) {
    if (ch in digit) {
      current = digit[ch];
    } else if (ch in unit) {
      const u = unit[ch];
      if (u === 10000) {
        result = (result + (current || 1)) * u;
        current = 0;
      } else {
        result += (current || 1) * u;
        current = 0;
      }
    }
  }
  return result + current;
}

function getChapterNum(title: string | undefined): number {
  if (!title) return -1;
  const normalized = title.replace(/\s/g, '');
  const m1 = CHAPTER_NUM_PATTERN1.exec(normalized);
  if (m1?.[1]) return parseChineseNumber(m1[1]);
  const m2 = CHAPTER_NUM_PATTERN2.exec(normalized);
  if (m2?.[1]) return parseChineseNumber(m2[1]);
  return -1;
}

/**
 * 在新目录中定位与旧阅读进度对应的章节索引（对齐 legado BookHelp.getDurChapter）
 */
export function getDurChapterIndex(
  oldIndex: number,
  oldTitle: string | undefined,
  newChapters: BookChapter[],
  oldChapterListSize = 0
): number {
  if (oldIndex <= 0) return 0;
  if (newChapters.length === 0) return oldIndex;

  const oldChapterNum = getChapterNum(oldTitle);
  const oldName = getPureChapterName(oldTitle);
  const newSize = newChapters.length;
  const scaledIndex =
    oldChapterListSize === 0
      ? oldIndex
      : Math.floor((oldIndex * oldChapterListSize) / newSize);
  const min = Math.max(0, Math.min(oldIndex, scaledIndex) - 10);
  const max = Math.min(newSize - 1, Math.max(oldIndex, scaledIndex) + 10);

  let nameSim = 0;
  let newIndex = 0;
  let newNum = 0;

  if (oldName) {
    for (let i = min; i <= max; i++) {
      const sim = jaccardSimilarity(oldName, getPureChapterName(newChapters[i].title));
      if (sim > nameSim) {
        nameSim = sim;
        newIndex = i;
      }
    }
  }

  if (nameSim < 0.96 && oldChapterNum > 0) {
    for (let i = min; i <= max; i++) {
      const temp = getChapterNum(newChapters[i].title);
      if (temp === oldChapterNum) {
        newNum = temp;
        newIndex = i;
        break;
      }
      if (Math.abs(temp - oldChapterNum) < Math.abs(newNum - oldChapterNum)) {
        newNum = temp;
        newIndex = i;
      }
    }
  }

  if (nameSim > 0.96 || Math.abs(newNum - oldChapterNum) < 1) {
    return newIndex;
  }
  return Math.min(Math.max(0, newSize - 1), oldIndex);
}

/**
 * 将旧书阅读进度、分组、自定义字段迁移到新书（可选按新目录重映射章节索引）
 */
export function migrateBookProgress(
  target: Book,
  source: Book,
  chapters?: BookChapter[]
): Book {
  const merged: Book = {
    ...target,
    durChapterTime: source.durChapterTime,
    durChapterPos: source.durChapterPos,
    group: source.group,
    order: source.order,
    originOrder: source.originOrder,
    customCoverUrl: source.customCoverUrl,
    customIntro: source.customIntro,
    customTag: source.customTag,
    canUpdate: source.canUpdate,
    readConfig: source.readConfig,
    variable: source.variable ?? target.variable,
    durChapterIndex: source.durChapterIndex,
    durChapterTitle: source.durChapterTitle,
  };

  if (chapters && chapters.length > 0) {
    const index = getDurChapterIndex(
      source.durChapterIndex,
      source.durChapterTitle,
      chapters,
      source.totalChapterNum
    );
    merged.durChapterIndex = index;
    merged.durChapterTitle = chapters[index]?.title ?? merged.durChapterTitle;
    merged.totalChapterNum = chapters.length;
  }

  return merged;
}

/** 书名+作者是否视为同一本书 */
export function isSameNameAndAuthor(a: Pick<Book, 'name' | 'author'>, b: Pick<Book, 'name' | 'author'>): boolean {
  return a.name === b.name && (a.author ?? '') === (b.author ?? '');
}
