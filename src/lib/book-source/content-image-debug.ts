/**
 * 漫画 / 图片集正文调试：统计 img 数量并打印前 N 条 URL
 */

import { scanImgTags } from '@/lib/media/text/scan-img-tags';
import { parseImgRefsFromHtml } from '@/lib/media/text/reader-content-blocks';

export type ContentImageSample = {
  index: number;
  urlTail: string;
  url: string;
  hasLegadoHeaders: boolean;
};

export function summarizeContentImages(
  content: string,
  sampleCount = 5,
): {
  scanTagCount: number;
  parseRefCount: number;
  samples: ContentImageSample[];
  tailSamples: ContentImageSample[];
} {
  const tags = scanImgTags(content);
  const refs = parseImgRefsFromHtml(content);
  const toSample = (ref: (typeof refs)[0], index: number): ContentImageSample => ({
    index: index + 1,
    urlTail: ref.url.split('/').pop()?.split('?')[0] ?? ref.url,
    url: ref.url,
    hasLegadoHeaders: Boolean(ref.legadoHeaders),
  });
  const samples = refs.slice(0, sampleCount).map(toSample);
  const tailStart = Math.max(0, refs.length - 2);
  const tailSamples = refs.slice(tailStart).map((r, i) => toSample(r, tailStart + i));
  return {
    scanTagCount: tags.length,
    parseRefCount: refs.length,
    samples,
    tailSamples,
  };
}

/** DEV：分阶段输出漫画 img 诊断（至少 sampleCount 条） */
export function logContentImageDiagnostics(
  content: string,
  stage: string,
  sampleCount = 5,
): void {
  if (!import.meta.env.DEV || !content?.includes('<img')) return;

  const summary = summarizeContentImages(content, sampleCount);
  console.log(`[content][images] ${stage}`, {
    scanTags: summary.scanTagCount,
    parsedRefs: summary.parseRefCount,
    mismatch: summary.scanTagCount !== summary.parseRefCount,
    contentLen: content.length,
  });

  for (const row of summary.samples) {
    console.log(
      `[content][images] ${stage} #${row.index}/${summary.parseRefCount}`,
      row.urlTail,
      row.hasLegadoHeaders ? '[legado-headers]' : '',
      row.url.slice(0, 140),
    );
  }

  if (summary.parseRefCount > sampleCount && summary.tailSamples.length > 0) {
    for (const row of summary.tailSamples) {
      if (row.index <= sampleCount) continue;
      console.log(
        `[content][images] ${stage} #${row.index}/${summary.parseRefCount}`,
        row.urlTail,
        row.hasLegadoHeaders ? '[legado-headers]' : '',
        row.url.slice(0, 140),
      );
    }
  }

  if (summary.scanTagCount !== summary.parseRefCount) {
    console.warn(`[content][images] ${stage} 扫描与解析数量不一致`, summary);
  }
}
