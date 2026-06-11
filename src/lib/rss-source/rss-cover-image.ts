/**
 * RSS 列表封面：CDN 防盗链须带书源 Referer（如 meirentu.club → cdn20.mmdb.cc）
 */

import type { RssSource } from '@/types';
import { parseHeaders } from '@/lib/book-source/utils';
import { clearCoverLoadFailure } from '@/lib/http/cover-load-guard';
import {
  isNoCoverImageUrl,
  loadCoverImageObjectUrl,
} from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

export function resolveRssCoverReferer(source: RssSource): string {
  const headers = parseHeaders(source.header);
  const fromHeader =
    headers.Referer ?? headers.referer ?? headers.REFERER;
  if (fromHeader?.trim()) return fromHeader.trim();
  return source.sourceUrl.trim();
}

export function resolveRssCoverLegadoHeaders(
  source: RssSource,
): Record<string, string> {
  return parseHeaders(source.header);
}

/** 拉取 RSS 列表缩略图为 blob URL（勿用 <img src=CDN> 直连） */
export async function loadRssArticleCoverBlob(
  source: RssSource,
  imageUrl: string,
): Promise<string | null> {
  const normalized = normalizeImageUrl(imageUrl.trim());
  if (!normalized || isNoCoverImageUrl(normalized)) return null;

  const bookSource = rssAsBookSource(source);
  const referer = resolveRssCoverReferer(source);
  const legadoImageHeaders = resolveRssCoverLegadoHeaders(source);
  const sourceId = source.sourceUrl;

  clearCoverLoadFailure(normalized, normalized, sourceId);

  const blob = await loadCoverImageObjectUrl(normalized, {
    source: bookSource,
    referer,
    legadoImageHeaders,
    bookUrl: normalized,
    skipDiskRead: true,
  });

  if (!blob && import.meta.env.DEV) {
    rssWarn(source, '列表封面加载失败', {
      image: normalized.slice(0, 120),
      referer: referer.slice(0, 80),
    });
  }

  return blob;
}

export function logRssArticleCoverParsed(
  source: RssSource,
  title: string,
  imageUrl: string | undefined,
): void {
  if (!import.meta.env.DEV || !imageUrl?.trim()) return;
  rssLog(source, '列表封面 URL', {
    title: title.slice(0, 40),
    image: imageUrl.trim().slice(0, 120),
  });
}
