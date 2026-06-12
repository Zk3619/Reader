/**

 * TXT 流式分块解析（对齐 Legado TextFile.kt：512KB 块、换行对齐、字节偏移）

 * 当前仅对 UTF-8 ArrayBuffer 启用；GBK 等仍走整文件字符串解析。

 */



import {

  scanTxtTocMatches,

  type TxtTocChapterMatch,

} from '@/lib/local-book/txt-toc-rule-engine';

import type { Book, BookChapter } from '@/types';



export const TXT_STREAM_BUFFER_SIZE = 512_000;



const MAX_LENGTH_WITH_TOC = 102_400;



function normalizeLineEndings(text: string): string {

  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

}



function formatWordCount(count: number): string {

  if (count < 1000) return `${count}字`;

  if (count < 10000) return `${(count / 1000).toFixed(1)}千字`;

  return `${(count / 10000).toFixed(1)}万字`;

}



function isVolumeTitle(title: string): boolean {

  return /^第?[零一二三四五六七八九十百千万0-9]+[卷部篇本]/u.test(title);

}



/** UTF-8 BOM 跳过的字节数 */

export function detectUtf8BomSkip(bytes: Uint8Array): number {

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {

    return 3;

  }

  return 0;

}



/** 块尾对齐到最后一个换行（0x0A），避免行内截断 */

export function alignBlockEndToNewline(bytes: Uint8Array, start: number, end: number): number {

  if (end >= bytes.length) return end;

  for (let i = end - 1; i > start; i--) {

    if (bytes[i] === 0x0a) return i + 1;

  }

  return end;

}



/** 块内字符索引 → 块内 UTF-8 字节偏移 */

export function utf8CharIndexToByteOffset(text: string, charIndex: number): number {

  if (charIndex <= 0) return 0;

  return new TextEncoder().encode(text.slice(0, charIndex)).byteLength;

}



/** 块内字符区间 → UTF-8 字节长度 */

export function utf8CharRangeToByteLength(text: string, startChar: number, endChar: number): number {

  return utf8CharIndexToByteOffset(text, endChar) - utf8CharIndexToByteOffset(text, startChar);

}



export interface StreamTxtTocMatch extends TxtTocChapterMatch {

  byteIndex: number;

}



/**

 * 512KB 分块扫描目录规则，返回带文件字节偏移的匹配

 */

export async function streamScanTxtTocMatches(

  fileBytes: ArrayBuffer,

  rule: string,

  replacement = '',

  book?: Record<string, unknown>,

): Promise<StreamTxtTocMatch[]> {

  const bytes = new Uint8Array(fileBytes);

  const bomSkip = detectUtf8BomSkip(bytes);

  let offset = bomSkip;

  const all: StreamTxtTocMatch[] = [];



  while (offset < bytes.length) {

    let blockEnd = Math.min(offset + TXT_STREAM_BUFFER_SIZE, bytes.length);

    if (blockEnd < bytes.length) {

      const aligned = alignBlockEndToNewline(bytes, offset, blockEnd);

      if (aligned > offset) blockEnd = aligned;

    }



    const blockBytes = bytes.subarray(offset, blockEnd);

    const blockText = normalizeLineEndings(new TextDecoder('utf-8').decode(blockBytes));

    const blockMatches = await scanTxtTocMatches(blockText, rule, replacement, book);



    for (const m of blockMatches) {
      const byteInBlock = utf8CharIndexToByteOffset(blockText, m.index);
      all.push({
        ...m,
        byteIndex: offset + byteInBlock,
      });
    }

    offset = blockEnd;

  }



  return all;

}



function splitOversizedChapterBytes(

  fileBytes: ArrayBuffer,

  startByte: number,

  endByte: number,

  baseTitle: string,

): BookChapter[] {

  const byteLen = endByte - startByte;

  if (byteLen <= MAX_LENGTH_WITH_TOC) {

    return [{

      url: '',

      title: baseTitle,

      isVolume: false,

      baseUrl: '',

      bookUrl: '',

      index: 0,

      isVip: false,

      isPay: false,

      start: startByte,

      end: endByte,

      wordCount: formatWordCount(byteLen),

    }];

  }



  const bytes = new Uint8Array(fileBytes);

  const parts: BookChapter[] = [];

  let partStart = startByte;

  let partIndex = 0;



  while (partStart < endByte) {

    let partEnd = Math.min(partStart + MAX_LENGTH_WITH_TOC, endByte);

    if (partEnd < endByte) {

      partEnd = alignBlockEndToNewline(bytes, partStart, partEnd);

      if (partEnd <= partStart) partEnd = Math.min(partStart + MAX_LENGTH_WITH_TOC, endByte);

    }

    parts.push({

      url: '',

      title: `${baseTitle}(${partIndex + 1})`,

      isVolume: false,

      baseUrl: '',

      bookUrl: '',

      index: partIndex,

      isVip: false,

      isPay: false,

      start: partStart,

      end: partEnd,

      wordCount: formatWordCount(partEnd - partStart),

    });

    partStart = partEnd;

    partIndex++;

  }



  return parts;

}



/**

 * 流式规则分章，章节 start/end 为文件字节偏移

 */

export async function parseChaptersWithTxtTocRuleStream(

  fileBytes: ArrayBuffer,

  rule: string,

  replacement: string,

  splitLongChapter = true,

  book?: Book,

): Promise<{ chapters: BookChapter[]; wordCount: number }> {

  if (!rule.trim()) {

    return { chapters: [], wordCount: 0 };

  }



  const jsBook = book

    ? {

        name: book.name,

        author: book.author,

        bookUrl: book.bookUrl,

        originName: book.originName,

        intro: book.intro,

      }

    : undefined;



  const matches = await streamScanTxtTocMatches(fileBytes, rule, replacement, jsBook);

  if (matches.length === 0) {

    return { chapters: [], wordCount: 0 };

  }



  const fileSize = fileBytes.byteLength;

  const chapters: BookChapter[] = [];

  let wordCount = 0;



  for (const match of matches) {

    const { byteIndex: chapterStartByte, title: chapterTitle, precedingContent, isVolume } = match;



    if (chapters.length > 0) {

      const lastChapter = chapters[chapters.length - 1]!;

      const segStart = lastChapter.start ?? 0;

      const segEnd = chapterStartByte;

      const segLen = segEnd - segStart;



      if (splitLongChapter && !lastChapter.isVolume && segLen > MAX_LENGTH_WITH_TOC) {

        chapters.pop();

        const splitParts = splitOversizedChapterBytes(fileBytes, segStart, segEnd, lastChapter.title);

        chapters.push(...splitParts);

        wordCount += segLen;

      } else {

        lastChapter.end = segEnd;

        if (!lastChapter.isVolume && precedingContent.trim() === '') {

          lastChapter.isVolume = true;

        }

        lastChapter.wordCount = formatWordCount(segLen);

        wordCount += segLen;

      }

    }



    chapters.push({

      url: '',

      title: chapterTitle,

      isVolume: isVolume === true || isVolumeTitle(chapterTitle),

      baseUrl: '',

      bookUrl: '',

      index: chapters.length,

      isVip: false,

      isPay: false,

      start: chapterStartByte,

      end: chapterStartByte,

    });



    if (chapters.length >= 2 && precedingContent.trim() === '') {

      const prev = chapters[chapters.length - 2]!;

      if (!prev.isVolume) prev.isVolume = true;

    }

  }



  if (chapters.length > 0) {

    const lastChapter = chapters[chapters.length - 1]!;

    const finalEnd = fileSize;

    const segLen = finalEnd - (lastChapter.start ?? 0);



    if (splitLongChapter && segLen > MAX_LENGTH_WITH_TOC) {

      const parentTitle = lastChapter.title;

      const parentStart = lastChapter.start ?? 0;

      chapters.pop();

      chapters.push(...splitOversizedChapterBytes(fileBytes, parentStart, finalEnd, parentTitle));

      wordCount += segLen;

    } else {

      lastChapter.end = finalEnd;

      lastChapter.wordCount = formatWordCount(segLen);

      wordCount += segLen;

    }

  }



  chapters.forEach((chapter, index) => {

    chapter.index = index;

  });



  return { chapters, wordCount };

}



/** 解码文件头部样本（最多 512KB），用于元数据与规则自动选择 */

export function decodeUtf8HeadSample(fileBytes: ArrayBuffer, maxBytes = TXT_STREAM_BUFFER_SIZE): string {

  const bytes = new Uint8Array(fileBytes);

  const bomSkip = detectUtf8BomSkip(bytes);

  const end = Math.min(bytes.length, bomSkip + maxBytes);

  const sample = bytes.subarray(bomSkip, end);

  return normalizeLineEndings(new TextDecoder('utf-8').decode(sample));

}



/** 字符串 char 索引 → 文件字节偏移（UTF-8，含 BOM 跳过） */

export function utf8CharIndexToFileByteOffset(headText: string, charIndex: number, bomSkip: number): number {

  return bomSkip + utf8CharIndexToByteOffset(headText, charIndex);

}


