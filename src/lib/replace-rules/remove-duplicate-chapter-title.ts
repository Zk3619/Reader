/**
 * 去除正文开头重复章节标题（对齐 Legado ContentProcessor.getContent）
 */

import { processTitle } from '@/lib/book-source/content-processor';
import { isReplaceRuleEnabledForBook } from '@/lib/replace-rules/replace-rule-policy';
import type { Book, BookChapter } from '@/types';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Legado escapeRegex + spaceRegex → \s* */
function titleToPattern(title: string): string {
  return escapeRegExp(title.trim()).replace(/\s+/g, '\\s*');
}

function tryRemoveByPattern(content: string, pattern: RegExp): string | null {
  const match = pattern.exec(content);
  if (!match) return null;
  return content.slice(match[0].length);
}

export interface RemoveDuplicateTitleOptions {
  useReplaceRule?: boolean;
  forceRemoveTitle?: boolean;
}

export interface RemoveDuplicateTitleResult {
  content: string;
  removed: boolean;
}

/**
 * 若正文开头重复出现章节名（或净化后的展示标题），则剔除。
 */
export async function removeDuplicateChapterTitle(
  content: string,
  book: Book,
  chapter: BookChapter,
  options: RemoveDuplicateTitleOptions = {},
): Promise<RemoveDuplicateTitleResult> {
  if (!content || content === 'null') {
    return { content, removed: false };
  }

  try {
    const bookName = titleToPattern(book.name);
    const prefix = `(\\s|\\p{P}|${bookName})*`;

    let next = tryRemoveByPattern(
      content,
      new RegExp(`^${prefix}${titleToPattern(chapter.title)}(\\s)*`, 'u'),
    );
    if (next != null) {
      return { content: next, removed: true };
    }

    if (options.useReplaceRule !== false && isReplaceRuleEnabledForBook(book)) {
      const displayTitle = await processTitle(chapter.title, book.name, book.origin, {
        book,
        chapter,
      });
      next = tryRemoveByPattern(
        content,
        new RegExp(`^${prefix}${titleToPattern(displayTitle)}(\\s)*`, 'u'),
      );
      if (next != null) {
        return { content: next, removed: true };
      }
    }

    if (options.forceRemoveTitle) {
      const firstLine = content.split('\n')[0]?.trim() ?? '';
      if (firstLine) {
        const chapterTitle = chapter.title.trim();
        const displayTitle = await processTitle(chapter.title, book.name, book.origin, {
          book,
          chapter,
        });
        const display = displayTitle.trim();
        const similar =
          firstLine === chapterTitle ||
          firstLine === display ||
          firstLine.includes(chapterTitle) ||
          chapterTitle.includes(firstLine) ||
          firstLine.includes(display) ||
          display.includes(firstLine);
        if (similar) {
          return {
            content: content.slice(firstLine.length).replace(/^\s+/, ''),
            removed: true,
          };
        }
      }
    }
  } catch (e) {
    console.warn('[replace] 去除重复标题失败', e);
  }

  return { content, removed: false };
}
