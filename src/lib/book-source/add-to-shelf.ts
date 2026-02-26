/**
 * 将发现/搜索结果加入书架并打开
 * 参照 legado：点击发现页书籍可加入书架并进入阅读
 */

import * as booksDb from '@/lib/database/books';
import * as chaptersDb from '@/lib/database/chapters';
import * as sourcesDb from '@/lib/database/sources';
import { getChapterList as fetchChapterList, toNewBookChapter } from './chapters';
import type { Book, NewBook, SearchBook } from '@/types';

function searchBookToNewBook(sb: SearchBook): NewBook {
  return {
    bookUrl: sb.bookUrl,
    tocUrl: sb.tocUrl,
    name: sb.name,
    author: sb.author ?? '',
    kind: sb.kind,
    intro: sb.intro,
    coverUrl: sb.coverUrl,
    origin: sb.origin,
    originName: sb.originName,
    type: sb.type,
  };
}

/**
 * 将发现/搜索得到的书籍加入书架并返回 Book（若已在书架则直接返回）
 * 会拉取章节列表并写入数据库
 */
export async function addSearchBookToShelf(sb: SearchBook): Promise<Book | null> {
  const existing = await booksDb.getBook(sb.bookUrl);
  if (existing) {
    // 已有书籍：若本地无章节则尝试补拉（解决移动端等首次拉取失败后目录为空）
    const count = await chaptersDb.getChapterCount(sb.bookUrl);
    if (count === 0 && existing.tocUrl && existing.origin) {
      try {
        const source = await sourcesDb.getSource(existing.origin);
        if (source) {
          const chapters = await fetchChapterList(source, existing.tocUrl);
          if (chapters.length > 0) {
            const newChapters = chapters.map((ch) => toNewBookChapter(ch, existing.bookUrl));
            await chaptersDb.insertChapters(newChapters);
          }
        }
      } catch (e) {
        console.warn('[addToShelf] 补拉章节列表失败:', e);
      }
    }
    return existing;
  }

  const source = await sourcesDb.getSource(sb.origin);
  if (!source) {
    console.warn('[addToShelf] 未找到书源:', sb.origin);
    return null;
  }

  const newBook = searchBookToNewBook(sb);
  await booksDb.insertBook(newBook);

  try {
    const tocUrl = sb.tocUrl || sb.bookUrl;
    const chapters = await fetchChapterList(source, tocUrl);
    if (chapters.length > 0) {
      const newChapters = chapters.map((ch) => toNewBookChapter(ch, sb.bookUrl));
      await chaptersDb.insertChapters(newChapters);
    }
  } catch (e) {
    console.warn('[addToShelf] 拉取章节列表失败:', e);
  }

  return booksDb.getBook(sb.bookUrl);
}
