/**
 * Web API /cover、/image PNG 直出（对齐 Legado BookController）
 */

import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { fetchReaderInlineImageBytes } from '@/lib/http/cover-image-loader';
import { resolveCoverRequestHeaders } from '@/lib/http/resolve-cover-referer';
import { queryParam } from '@/lib/web-api/query';
import { binaryApiResult, jsonApiResult, type WebApiDispatchResult } from '@/lib/web-api/response';
import { legadoErr } from '@/lib/web-api/return-data';
import { createPlaceholderPng, encodeBytesAsPng } from '@/lib/web-api/web-image-png';

const COVER_W = 84;
const COVER_H = 112;
const DEFAULT_IMAGE_WIDTH = 640;

async function fetchImageBytes(
  imageUrl: string,
  options?: {
    referer?: string;
    source?: Awaited<ReturnType<typeof sourcesDb.getSource>>;
    bookUrl?: string;
  },
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(trimmed);
    if (!match?.[2]) return null;
    const mime = match[1]?.trim() || 'image/png';
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { bytes: bytes.buffer, mime };
  }

  const legadoHeaders = options?.source
    ? resolveCoverRequestHeaders(
        options.referer,
        options.source,
        trimmed,
        undefined,
      )
    : undefined;

  return fetchReaderInlineImageBytes(trimmed, {
    referer: options?.referer,
    source: options?.source ?? undefined,
    bookUrl: options?.bookUrl,
    legadoImageHeaders: legadoHeaders,
    maxRetries: 1,
  });
}

export async function getCoverApi(
  query: Record<string, string> | undefined,
): Promise<WebApiDispatchResult> {
  const path = queryParam(query, 'path');
  if (!path) {
    const placeholder = await createPlaceholderPng(COVER_W, COVER_H, '封面');
    return binaryApiResult(placeholder, 'image/png');
  }

  try {
    const fetched = await fetchImageBytes(path);
    if (fetched) {
      const png = await encodeBytesAsPng(fetched.bytes, fetched.mime, {
        width: COVER_W,
        height: COVER_H,
        fit: 'cover',
      });
      return binaryApiResult(png, 'image/png');
    }
  } catch (e) {
    console.warn('[web-api] /cover 加载失败', e);
  }

  const fallback = await createPlaceholderPng(COVER_W, COVER_H, '封面');
  return binaryApiResult(fallback, 'image/png');
}

export async function getBookImageApi(
  query: Record<string, string> | undefined,
): Promise<WebApiDispatchResult> {
  const bookUrl = queryParam(query, 'url');
  const src = queryParam(query, 'path');
  if (!bookUrl) {
    return jsonApiResult(legadoErr('bookUrl为空'));
  }
  if (!src) {
    return jsonApiResult(legadoErr('图片链接为空'));
  }

  const widthRaw = queryParam(query, 'width');
  const width = widthRaw ? Number.parseInt(widthRaw, 10) : DEFAULT_IMAGE_WIDTH;
  const maxWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_IMAGE_WIDTH;

  const book = await booksDb.getBook(bookUrl);
  if (!book) {
    return jsonApiResult(legadoErr('bookUrl不对'));
  }

  const source = await sourcesDb.getSource(book.origin);
  const chapterReferer = book.bookUrl;

  try {
    const fetched = await fetchImageBytes(src, {
      referer: chapterReferer,
      source: source ?? undefined,
      bookUrl: book.bookUrl,
    });
    if (fetched) {
      const png = await encodeBytesAsPng(fetched.bytes, fetched.mime, { maxWidth });
      return binaryApiResult(png, 'image/png');
    }
  } catch (e) {
    console.warn('[web-api] /image 加载失败', bookUrl, src.slice(0, 120), e);
  }

  const errorPng = await createPlaceholderPng(
    Math.min(maxWidth, 320),
    Math.min(Math.round(maxWidth * 0.75), 240),
    '!',
  );
  return binaryApiResult(errorPng, 'image/png');
}
