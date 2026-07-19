/**
 * 从书籍信息解析封面加载参数（referer + 书源），避免非书架页缺 source 导致封面永不加载。
 */

import { createMemo, splitProps, type Component } from 'solid-js';
import { BookCoverImg, type BookCoverImgProps } from '@/components/media/reader/books/BookCoverImg';
import { sourcesStore } from '@/stores/sources';
import type { Book } from '@/types';

export type BookCoverFromBookInput = {
  book?: Book | null;
  bookUrl?: string | null;
  origin?: string | null;
  coverUrl?: string | null;
  customCoverUrl?: string | null;
};

export function resolveBookCoverLoadParams(
  input: BookCoverFromBookInput,
): Pick<BookCoverImgProps, 'src' | 'referer' | 'source' | 'bookUrl'> {
  const book = input.book;
  const origin = (book?.origin ?? input.origin ?? '').trim();
  // 订阅书源列表，加载完成后自动触发封面重试
  void sourcesStore.state.bookSources.length;

  return {
    src: book?.customCoverUrl || book?.coverUrl || input.customCoverUrl || input.coverUrl,
    referer: origin || undefined,
    source: origin ? sourcesStore.getBookSource(origin) ?? null : null,
    bookUrl: book?.bookUrl ?? input.bookUrl ?? undefined,
  };
}

type BookCoverFromBookProps = Omit<BookCoverImgProps, 'src' | 'referer' | 'source' | 'bookUrl'> &
  BookCoverFromBookInput;

export const BookCoverFromBook: Component<BookCoverFromBookProps> = (props) => {
  const [local, imgProps] = splitProps(props, [
    'book',
    'bookUrl',
    'origin',
    'coverUrl',
    'customCoverUrl',
  ]);

  const resolved = createMemo(() => resolveBookCoverLoadParams(local));

  return (
    <BookCoverImg
      {...imgProps}
      src={resolved().src}
      referer={resolved().referer}
      source={resolved().source}
      bookUrl={resolved().bookUrl}
    />
  );
};
