/**
 * 书籍排序工具函数
 * 参考 legado 的排序逻辑
 */

import type { Book } from '@/types/book';
import type { SortMode } from '@/stores/bookshelf-layout';

/**
 * 中文比较函数（用于书名和作者排序）
 */
function cnCompare(a: string | null | undefined, b: string | null | undefined): number {
  const strA = (a || '').trim();
  const strB = (b || '').trim();
  if (!strA && !strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;
  return strA.localeCompare(strB, 'zh-CN');
}

function compareByStableOrder(a: Book, b: Book): number {
  const orderA = a.order || 0;
  const orderB = b.order || 0;
  if (orderA !== orderB) return orderA - orderB;
  return cnCompare(a.name, b.name);
}

/**
 * 根据排序模式对书籍列表进行排序
 */
export function sortBooks(books: Book[], sortMode: SortMode): Book[] {
  const sorted = [...books];

  switch (sortMode) {
    case 'read-time':
      // 按阅读时间降序
      sorted.sort((a, b) => {
        const timeA = a.durChapterTime || 0;
        const timeB = b.durChapterTime || 0;
        if (timeB !== timeA) return timeB - timeA;
        return compareByStableOrder(a, b);
      });
      break;

    case 'update-time':
      // 按更新时间降序
      sorted.sort((a, b) => {
        const timeA = a.latestChapterTime || 0;
        const timeB = b.latestChapterTime || 0;
        if (timeB !== timeA) return timeB - timeA;
        return compareByStableOrder(a, b);
      });
      break;

    case 'book-name':
      // 按书名中文排序
      sorted.sort((a, b) => cnCompare(a.name, b.name));
      break;

    case 'manual':
      // 手动排序（按 order 字段升序）
      sorted.sort(compareByStableOrder);
      break;

    case 'comprehensive':
      // 综合排序：max(latestChapterTime, durChapterTime) 降序
      sorted.sort((a, b) => {
        const timeA = Math.max(a.latestChapterTime || 0, a.durChapterTime || 0);
        const timeB = Math.max(b.latestChapterTime || 0, b.durChapterTime || 0);
        if (timeB !== timeA) return timeB - timeA;
        return compareByStableOrder(a, b);
      });
      break;

    case 'author':
      // 按作者中文排序
      sorted.sort((a, b) => cnCompare(a.author, b.author));
      break;

    default:
      // 默认按阅读时间降序
      sorted.sort((a, b) => {
        const timeA = a.durChapterTime || 0;
        const timeB = b.durChapterTime || 0;
        return timeB - timeA;
      });
  }

  return sorted;
}
