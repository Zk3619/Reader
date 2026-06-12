/**
 * TXT文件解析器
 * 对应 legado 项目的 TextFile.kt
 * 
 * 功能：
 * 1. 解析TXT文件，识别章节
 * 2. 提取章节内容
 * 3. 支持多种编码格式
 * 4. 支持自定义章节规则
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { getEnabledTxtTocRules } from '@/lib/database/txt-toc-rules';
import { txtOffsetsAreBytes, type TxtOffsetUnit } from '@/lib/local-book/local-txt-file-meta';
import {
  encodeTocRuleStorage,
  isLegacyTocUrlAsBookPath,
  isStoredTxtTocRule,
  parseTocRuleStorage,
  scanTxtTocMatches,
  selectBestTxtTocRule,
  toTxtTocJsBook,
} from '@/lib/local-book/txt-toc-rule-engine';
import {
  decodeUtf8HeadSample,
  detectUtf8BomSkip,
  parseChaptersWithTxtTocRuleStream,
  TXT_STREAM_BUFFER_SIZE,
  utf8CharIndexToFileByteOffset,
} from '@/lib/local-book/txt-stream-parser';
import type { Book, BookChapter } from '@/types';

/**
 * TXT 正文头部元数据（书名、作者、简介）
 */
export interface TxtMetadata {
  title?: string;
  author?: string;
  intro?: string;
  /** 正文起始位置（首个章节行在 content 中的索引） */
  bodyStart: number;
}

/**
 * TXT文件解析结果
 */
export interface TxtParseResult {
  chapters: BookChapter[];
  wordCount: number;
  charset: string;
  tocRule?: string;
  /** 章节 start/end 单位 */
  offsetUnit?: TxtOffsetUnit;
  /** 从正文解析出的书名（首行等） */
  title?: string;
  /** 从正文解析出的作者（作者：xxx） */
  author?: string;
  /** 从正文解析出的简介（内容简介：...） */
  intro?: string;
}

/**
 * 默认章节识别规则（正则表达式）
 * 参考 legado 及常见网文/本地 TXT 格式，按优先级与兼容性排列。
 * 通用排除正文：凡含“章/节/回/卷/部/篇/本”的规则均加 (?!\S)，即该字后须为空白或行尾，避免将“万卷经”“八部众”“第一本书”等短语误识为章节。
 */
const DEFAULT_CHAPTER_PATTERNS: RegExp[] = [
  // 一、特殊章节（楔子、序章、前言等，必须整词匹配，避免正文“前面…”等被误判）
  /^\s*(楔子|序章|序言|前言|引子|尾声|后记|终章)\s*[：:]?\s*.*$/m,
  // 二、标准中文：第X章/回/卷/节/集/部/篇（章/节/回/卷/部/篇 后须为空白或结尾，排除正文如 万卷经）
  /^\s*第[零一二三四五六七八九十百千万〇○0-9]+[章节回集卷部篇](?!\S)\s*[：:]?\s*.{0,80}$/m,
  // 三、卷+章：卷X 第Y章 或 第X卷 第Y章
  /^\s*卷[零一二三四五六七八九十0-9]+\s+.*$/m,
  /^\s*第[零一二三四五六七八九十百千万0-9]+卷(?!\S)\s*.{0,80}$/m,
  // 四、英文章节
  /^\s*Chapter\s+\d+\s*[：:.\-]?\s*.*$/im,
  /^\s*CHAPTER\s+\d+.*$/m,
  /^\s*Section\s+\d+.*$/im,
  /^\s*Part\s+\d+.*$/im,
  // 五、数字开头：1. 标题 / 1、标题 / 1 标题
  /^\s*[0-9]+[.、\s]\s+.{1,80}$/m,
  // 六、中文数字序号：一、二、三、 或 壹、贰、叁、
  /^\s*[一二三四五六七八九十百千壹贰叁肆伍陆柒捌玖拾][、．.．]\s*.{1,80}$/m,
  // 七、番外、篇外
  /^\s*番外[篇章]?\s*[零一二三四五六七八九十0-9]*\s*[：:]?\s*.{0,80}$/m,
  /^\s*篇外[篇章]?\s*[零一二三四五六七八九十0-9]*\s*[：:]?\s*.{0,80}$/m,
  // 八、括号/星号形式：【第X章】、* 第X章、(第X章)
  /^\s*[【\[\(（*＊]\s*第?[零一二三四五六七八九十百千万0-9]+[章节回]\s*[】\]\)）]?\s*.{0,80}$/m,
  // 八之二、日记/日志体（通用）：【第X天】单独成行、第X本
  /^\s*[【\[]\s*第[零一二三四五六七八九十百千万0-9]+天\s*[】\]]\s*.{0,80}$/m,
  /^\s*第[零一二三四五六七八九十百千万0-9]+本(?!\S)\s*.{0,80}$/m,
  // 九、第X节（节 后须为空白或结尾，排除正文如 节选）
  /^\s*第[零一二三四五六七八九十百千万0-9]+节(?!\S)\s*[：:]?\s*.{0,80}$/m,
  // 十、宽松：行首“第”+数字+章/回/卷等（关键字后须为空白或结尾，排除正文短语）
  /^\s*第\s*[零一二三四五六七八九十百千万〇○0-9]+\s*[章节回集卷部篇](?!\S).*$/m,
  // 数字+章节回（无“第”）：要求 章/节/回/卷/部/篇 后为空白或结尾，排除正文短语（如 万卷经、八部众、千章 等）
  /^\s*[零一二三四五六七八九十百千万0-9]+\s*[章节回集卷部篇](?!\S)\s*.{0,80}$/m,
];

/**
 * 没有目录时，每个章节的最大长度（10KB）
 */
const MAX_LENGTH_WITH_NO_TOC = 10 * 1024;

/** 有目录规则时，单章超过此长度将自动拆分（对齐 Legado maxLengthWithToc ≈ 3 万字） */
const MAX_LENGTH_WITH_TOC = 102_400;

/** 章节匹配视为有效的最小间距（字节），避免把段落内相似行当成章节 */
/** 判断两条是否同为【第X天】且其一为另一前缀（行首整行匹配 vs 补采短匹配视为同一章） */
function isSameDayMarker(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (!/^[【\[]\s*第[零一二三四五六七八九十百千万0-9]+天\s*[】\]]/.test(x)) return false;
  if (!/^[【\[]\s*第[零一二三四五六七八九十百千万0-9]+天\s*[】\]]/.test(y)) return false;
  return x.startsWith(y) || y.startsWith(x);
}

/**
 * 统一换行符为 \n，便于正则 ^ $ 按行匹配
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 作者行：作者：xxx 或 作者:xxx */
const AUTHOR_LINE = /^\s*作者\s*[：:]\s*(.+)$/m;
/**
 * 判断一行是否匹配任一章节标题规则（按单行测试，^$ 即行首行尾）
 */
function isChapterTitleLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  for (const pattern of DEFAULT_CHAPTER_PATTERNS) {
    const regex = new RegExp(pattern.source, 'm');
    if (regex.test(trimmed)) return true;
  }
  return false;
}

/**
 * 在 content 中找到第一个章节标题行的起始索引
 */
function findFirstChapterIndex(content: string): number {
  const lines = content.split('\n');
  let offset = 0;
  for (const line of lines) {
    const lineWithNewline = line + '\n';
    if (isChapterTitleLine(line)) return offset;
    offset += lineWithNewline.length;
  }
  return offset >= content.length ? 0 : offset;
}

/**
 * 从 TXT 正文头部解析书名、作者、简介及正文起始位置
 * 格式示例：首行书名 → 作者：xxx → 内容简介： → 多行简介 → 第一章 ...
 */
function parseTxtMetadata(content: string): TxtMetadata {
  const bodyStart = findFirstChapterIndex(content);
  const header = bodyStart > 0 ? content.substring(0, bodyStart) : '';
  const result: TxtMetadata = { bodyStart };

  const lines = header.split('\n').map((s) => s.trim());
  let i = 0;

  // 首行：书名（若非 作者：/内容简介/简介）
  if (lines.length > 0 && lines[0]) {
    const first = lines[0];
    if (!/^\s*作者\s*[：:]/.test(first) && !/^\s*内容简介\s*[：:]?/.test(first) && !/^\s*简介\s*[：:]?/.test(first)) {
      result.title = first;
      i = 1;
    }
  }

  // 作者：xxx
  for (; i < lines.length; i++) {
    const m = lines[i].match(AUTHOR_LINE);
    if (m) {
      result.author = m[1].trim();
      i++;
      break;
    }
  }

  // 简介：支持“内容简介”或“简介”（均可选冒号），取到“作者简介”或正文前
  const introHeaderMatch =
    header.match(/\s*内容简介\s*[：:]?\s*\n?/) ?? header.match(/\s*简介\s*[：:]?\s*\n?/);
  if (introHeaderMatch) {
    const introStartInHeader = header.indexOf(introHeaderMatch[0]) + introHeaderMatch[0].length;
    let rest = header.slice(introStartInHeader);
    const authorIntroIdx = rest.search(/\s*作者简介\s*[：:]?\s*/);
    if (authorIntroIdx !== -1) rest = rest.slice(0, authorIntroIdx);
    const trimmed = rest.trim();
    if (trimmed) result.intro = trimmed;
  }

  return result;
}

/**
 * 获取TXT文件的章节列表
 */
export async function getTxtChapterList(
  book: Book,
  fileContent: string | ArrayBuffer,
  charset: string = 'utf-8'
): Promise<TxtParseResult> {
  let content: string;
  let rawBuffer: ArrayBuffer | null = null;
  let useByteOffsets = false;
  let bomSkip = 0;
  let offsetUnit: TxtOffsetUnit = 'char';

  if (fileContent instanceof ArrayBuffer) {
    rawBuffer = fileContent;
    bomSkip = detectUtf8BomSkip(new Uint8Array(fileContent));
    const headOnly = fileContent.byteLength > TXT_STREAM_BUFFER_SIZE + bomSkip;
    const detectBuffer = headOnly
      ? fileContent.slice(0, bomSkip + TXT_STREAM_BUFFER_SIZE)
      : fileContent;
    const detected = await detectEncodingFromBuffer(detectBuffer);
    charset = detected.charset;
    if (!book.charset) book.charset = charset;

    const charsetLower = charset.toLowerCase();
    if (charsetLower === 'utf-8' && headOnly) {
      useByteOffsets = true;
      offsetUnit = 'byte';
      content = decodeUtf8HeadSample(fileContent);
    } else if (headOnly && charsetLower !== 'utf-8') {
      const full = await detectEncodingFromBuffer(fileContent);
      charset = full.charset;
      content = normalizeLineEndings(full.text);
      if (!book.charset) book.charset = charset;
    } else {
      content = normalizeLineEndings(detected.text);
    }
  } else {
    content = fileContent;
    if (!book.charset) {
      charset = await detectEncoding(content);
      book.charset = charset;
    }
  }

  content = normalizeLineEndings(content);

  // 解析正文头部元数据（书名、作者、简介）
  const metadata = parseTxtMetadata(content);

  // 目录规则：书籍 tocUrl 缓存 > readConfig.tocRule > 数据库规则自动选择 > 内置多规则 > 按大小分章
  let chapters: BookChapter[];
  let wordCount: number;
  let tocRule: string | undefined;
  const readConfig = book.readConfig as { tocRule?: string; splitLongChapter?: boolean } | undefined;
  const customTocRule = readConfig?.tocRule?.trim();
  const splitLongChapter = readConfig?.splitLongChapter !== false;
  const tocUrlForRule = isLegacyTocUrlAsBookPath(book.tocUrl, book.bookUrl) ? '' : book.tocUrl;
  const storedRule = isStoredTxtTocRule(tocUrlForRule) ? parseTocRuleStorage(tocUrlForRule) : null;

  try {
    if (storedRule) {
      const parsed = storedRule.rule.trim()
        ? useByteOffsets && rawBuffer
          ? await parseChaptersWithTxtTocRuleStream(
              rawBuffer,
              storedRule.rule,
              storedRule.replacement,
              splitLongChapter,
              book,
            )
          : await parseChaptersWithTxtTocRule(
              content,
              storedRule.rule,
              storedRule.replacement,
              charset,
              splitLongChapter,
              book,
            )
        : parseChaptersWithoutRule(content, charset);
      chapters = parsed.chapters;
      wordCount = parsed.wordCount;
      tocRule = encodeTocRuleStorage(storedRule.rule, storedRule.replacement);
      if (!storedRule.rule.trim()) offsetUnit = 'char';
    } else if (customTocRule) {
      const parsed = useByteOffsets && rawBuffer
        ? await parseChaptersWithTxtTocRuleStream(
            rawBuffer,
            customTocRule,
            '',
            splitLongChapter,
            book,
          )
        : await parseChaptersWithTxtTocRule(
            content,
            customTocRule,
            '',
            charset,
            splitLongChapter,
            book,
          );
      chapters = parsed.chapters;
      wordCount = parsed.wordCount;
      tocRule = encodeTocRuleStorage(customTocRule, '');
    } else {
      const sample = content.slice(0, TXT_STREAM_BUFFER_SIZE);
      const enabledRules = await getEnabledTxtTocRules();
      const picked = enabledRules.length > 0 ? await selectBestTxtTocRule(sample, enabledRules) : null;
      if (picked?.rule.trim()) {
        const parsed = useByteOffsets && rawBuffer
          ? await parseChaptersWithTxtTocRuleStream(
              rawBuffer,
              picked.rule,
              picked.replacement,
              splitLongChapter,
              book,
            )
          : await parseChaptersWithTxtTocRule(
              content,
              picked.rule,
              picked.replacement,
              charset,
              splitLongChapter,
              book,
            );
        chapters = parsed.chapters;
        wordCount = parsed.wordCount;
        tocRule = encodeTocRuleStorage(picked.rule, picked.replacement);
      } else {
        const parsed = parseChaptersWithAllPatterns(content, charset);
        chapters = parsed.chapters;
        wordCount = parsed.wordCount;
        offsetUnit = 'char';
        if (chapters.length > 0) tocRule = 'multi';
      }
    }
    if (chapters.length === 0) {
      const fallback = parseChaptersWithoutRule(content, charset);
      chapters = fallback.chapters;
      wordCount = fallback.wordCount;
    }
  } catch (e) {
    console.warn('[TXT解析] 章节解析异常，按大小自动分章:', e);
    const fallback = parseChaptersWithoutRule(content, charset);
    chapters = fallback.chapters;
    wordCount = fallback.wordCount;
  }

  // 若有正文前导（书名/简介等）且首个章节并非从 0 开始，则插入“简介”章，便于在目录中阅读
  if (metadata.bodyStart > 0 && chapters.length > 0) {
    const firstStart = chapters[0].start ?? 0;
    const introEnd =
      offsetUnit === 'byte' && rawBuffer
        ? utf8CharIndexToFileByteOffset(content, metadata.bodyStart, bomSkip)
        : metadata.bodyStart;
    if (firstStart > introEnd && introEnd > 0) {
      const introBlock =
        offsetUnit === 'byte' && rawBuffer
          ? new TextDecoder('utf-8').decode(rawBuffer.slice(bomSkip, introEnd)).trim()
          : content.substring(0, metadata.bodyStart).trim();
      if (introBlock.length > 20) {
        const introChapter: BookChapter = {
          url: '',
          title: '内容简介',
          isVolume: false,
          baseUrl: '',
          bookUrl: '',
          index: 0,
          isVip: false,
          isPay: false,
          start: offsetUnit === 'byte' ? bomSkip : 0,
          end: introEnd,
          wordCount: formatWordCount(introBlock.length),
        };
        chapters.unshift(introChapter);
        wordCount += introBlock.length;
      }
    }
  }

  // 设置章节索引和URL
  chapters.forEach((chapter, index) => {
    chapter.index = index;
    chapter.bookUrl = book.bookUrl;
    chapter.baseUrl = book.bookUrl;
    if (!chapter.url) {
      chapter.url = `${book.bookUrl}#chapter_${index}`;
    }
    if (!chapter.title || chapter.title.trim() === '') {
      chapter.title = `第${index + 1}章`;
    }
  });

  return {
    chapters,
    wordCount,
    charset,
    tocRule,
    offsetUnit,
    title: metadata.title,
    author: metadata.author,
    intro: metadata.intro,
  };
}

// 缓存解码后的文件内容，避免重复解码大文件
const decodedContentCache = new Map<string, { content: string; charset: string; timestamp: number }>();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取TXT章节内容
 */
export async function getTxtContent(
  book: Book,
  chapter: BookChapter,
  fileContent: string | ArrayBuffer,
  charset: string = 'utf-8'
): Promise<string> {
  const useByteSlice =
    txtOffsetsAreBytes(book) &&
    fileContent instanceof ArrayBuffer &&
    chapter.start != null &&
    chapter.end != null;

  if (useByteSlice) {
    const start = chapter.start!;
    const end = chapter.end!;
    if (start >= end) return '';
    const slice = fileContent.slice(start, end);
    let body = normalizeLineEndings(new TextDecoder(charset, { fatal: false }).decode(slice));
    body = body.replace(/\s+$/, '');
    if (!chapter.title) return body;
    const firstLineEnd = body.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? body : body.slice(0, firstLineEnd);
    if (firstLine.trim() === chapter.title) {
      body = firstLineEnd === -1 ? '' : body.slice(firstLineEnd + 1);
      while (body.startsWith('\n')) {
        body = body.slice(1);
      }
    }
    body = body.replace(/^[\n\s]+/, '　　');
    return body;
  }

  // 将文件内容转换为字符串（与解析章节时一致，统一换行符以便 start/end 对齐）
  let content: string;
  if (fileContent instanceof ArrayBuffer) {
    // 检查缓存
    const cacheKey = `${book.bookUrl}_${charset}`;
    const cached = decodedContentCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.charset === charset && (now - cached.timestamp) < CACHE_MAX_AGE) {
      // 使用缓存
      content = cached.content;
      // console.log('[TXT内容] 使用缓存内容，大小:', content.length);
    } else {
      // 需要解码
      // console.log('[TXT内容] 开始解码文件，大小:', fileContent.byteLength);
      const charsetLower = charset.toLowerCase();
      if ((charsetLower === 'gbk' || charsetLower === 'gb2312' || charsetLower === 'gb18030')) {
        try {
          if (isTauri()) {
            // 在 Tauri 环境中，使用 Rust 后端解码 GBK
            const bytes = new Uint8Array(fileContent);
            content = await invoke<string>('decode_gbk', { data: Array.from(bytes) });
            // console.log('[TXT内容] 使用 Rust 后端成功解码 GBK');
          } else {
            // 浏览器环境，使用 UTF-8 非 fatal 解码（会出现乱码）
            const decoder = new TextDecoder('utf-8', { fatal: false });
            content = decoder.decode(fileContent);
            // console.warn('[TXT内容] 浏览器环境无法正确解码 GBK，可能出现乱码');
          }
        } catch (e) {
          console.warn('[TXT内容] GBK 解码失败，使用 fallback:', e);
          // Fallback: 使用 UTF-8 非 fatal 解码
          const decoder = new TextDecoder('utf-8', { fatal: false });
          content = decoder.decode(fileContent);
        }
      } else {
        // 其他字符集，使用标准解码器
        const decoder = new TextDecoder(charset, { fatal: false });
        content = decoder.decode(fileContent);
      }

      // 统一换行符
      content = normalizeLineEndings(content);

      // 存入缓存
      decodedContentCache.set(cacheKey, {
        content,
        charset,
        timestamp: now,
      });
      // console.log('[TXT内容] 内容已缓存，解码后大小:', content.length);

      // 清理过期缓存（限制缓存数量，避免内存泄漏）
      if (decodedContentCache.size > 10) {
        const entries = Array.from(decodedContentCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        // 删除最旧的缓存
        for (let i = 0; i < entries.length - 10; i++) {
          decodedContentCache.delete(entries[i][0]);
        }
      }
    }
  } else {
    content = fileContent;
    content = normalizeLineEndings(content);
  }

  // 如果有起始和结束位置，直接提取（跳过章节标题行，只返回正文，标题由阅读器单独显示）
  if (chapter.start != null && chapter.end != null) {
    const start = chapter.start;
    const end = chapter.end;
    if (start >= end) return '';
    let body = content.substring(start, end);
    // 只移除末尾的空白，保留段首缩进
    body = body.replace(/\s+$/, '');
    if (!chapter.title) return body;
    // 跳过首行：必须为章节名（允许前后空白），再跳过该行及紧随的空白行
    const firstLineEnd = body.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? body : body.slice(0, firstLineEnd);
    if (firstLine.trim() === chapter.title) {
      // 移除章节标题行
      body = firstLineEnd === -1 ? '' : body.slice(firstLineEnd + 1);
      // 只移除开头的换行符，保留段首空格（缩进）
      while (body.startsWith('\n')) {
        body = body.slice(1);
      }
    }
    // 对齐 Legado TextFile.padRegex：段首空白统一为全角缩进
    body = body.replace(/^[\n\s]+/, '　　');
    return body;
  }

  // 否则尝试通过标题查找
  if (chapter.title) {
    const titleIndex = content.indexOf(chapter.title);
    if (titleIndex !== -1) {
      // 查找下一个章节标题
      const nextChapterIndex = findNextChapterIndex(content, titleIndex + chapter.title.length);
      const end = nextChapterIndex !== -1 ? nextChapterIndex : content.length;
      return content.substring(titleIndex + chapter.title.length, end).trim();
    }
  }

  return '';
}

/**
 * 使用所有章节规则合并解析（第一章、番外、篇外等全部识别）
 */
function parseChaptersWithAllPatterns(
  content: string,
  _charset: string
): { chapters: BookChapter[]; wordCount: number } {
  const matches: { index: number; title: string }[] = [];

  for (const pattern of DEFAULT_CHAPTER_PATTERNS) {
    const regex = new RegExp(pattern.source, 'gm');
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(content)) !== null) {
      const title = m[0].trim();
      if (title.length > 0 && title.length <= 120) {
        // 排除长段且含多句号的正文（如词、诗、赞文），避免“万卷经书曾读过…”等被当章节名
        const periodCount = (title.match(/。/g) ?? []).length;
        if (title.length > 45 && periodCount >= 2) continue;
        matches.push({ index: m.index, title });
      }
    }
  }

  // 补采：全文扫描【第X天】（通用，日记/日志体可能单独成段仅前后换行），避免漏章
  const dayPattern = /[【\[]\s*第[零一二三四五六七八九十百千万0-9]+天\s*[】\]]/g;
  let dayMatch: RegExpExecArray | null;
  dayPattern.lastIndex = 0;
  while ((dayMatch = dayPattern.exec(content)) !== null) {
    const title = dayMatch[0].trim();
    if (title.length <= 120) matches.push({ index: dayMatch.index, title });
  }

  // 按位置排序
  matches.sort((a, b) => a.index - b.index || a.title.length - b.title.length);
  const deduped: { index: number; title: string }[] = [];
  /** 同一章在行内的最大间距（行首整行匹配 vs 补采短匹配会产生相近两条，合并为一条、保留短标题，通用） */
  const SAME_LINE_THRESHOLD = 80;
  for (const m of matches) {
    const last = deduped[deduped.length - 1];
    if (last !== undefined) {
      const dist = m.index - last.index;
      if (dist === 0) {
        if (m.title.length < last.title.length) deduped[deduped.length - 1] = m;
        continue;
      }
      if (dist > 0 && dist < SAME_LINE_THRESHOLD && isSameDayMarker(last.title, m.title)) {
        const keep = m.title.length < last.title.length ? m : last;
        const keepIndex = Math.min(last.index, m.index);
        deduped[deduped.length - 1] = { index: keepIndex, title: keep.title };
        continue;
      }
    }
    deduped.push(m);
  }

  const chapters: BookChapter[] = [];
  let wordCount = 0;

  for (const { index: chapterStart, title: chapterTitle } of deduped) {
    // 不再按最小间距跳过匹配，避免【第一天】～【第五天】等被合并为一章（间距过滤易误伤）
    if (chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      lastChapter.end = chapterStart;
      const chapterContent = content.substring(lastChapter.start ?? 0, chapterStart);
      lastChapter.wordCount = formatWordCount(chapterContent.length);
      wordCount += chapterContent.length;
    }

    chapters.push({
      url: '',
      title: chapterTitle,
      isVolume: /^第?[零一二三四五六七八九十百千万0-9]+[卷部篇本]/u.test(chapterTitle),
      baseUrl: '',
      bookUrl: '',
      index: chapters.length,
      isVip: false,
      isPay: false,
      start: chapterStart,
      end: chapterStart,
    });
  }

  if (chapters.length > 0) {
    const lastChapter = chapters[chapters.length - 1];
    lastChapter.end = content.length;
    const chapterContent = content.substring(lastChapter.start ?? 0, content.length);
    lastChapter.wordCount = formatWordCount(chapterContent.length);
    wordCount += chapterContent.length;
  }

  chapters.forEach((chapter, index) => {
    chapter.index = index;
  });

  return { chapters, wordCount };
}

function isVolumeTitle(title: string): boolean {
  return /^第?[零一二三四五六七八九十百千万0-9]+[卷部篇本]/u.test(title);
}

/**
 * 超长章节按固定长度再切分（对齐 Legado splitLongChapter）
 */
function splitOversizedChapter(
  content: string,
  start: number,
  end: number,
  baseTitle: string,
  charset: string,
): BookChapter[] {
  const slice = content.substring(start, end);
  if (slice.length <= MAX_LENGTH_WITH_TOC) {
    return [{
      url: '',
      title: baseTitle,
      isVolume: false,
      baseUrl: '',
      bookUrl: '',
      index: 0,
      isVip: false,
      isPay: false,
      start,
      end,
      wordCount: formatWordCount(slice.length),
    }];
  }

  const split = parseChaptersWithoutRule(slice, charset);
  return split.chapters.map((ch, i) => ({
    ...ch,
    title: `${baseTitle}(${i + 1})`,
    start: start + (ch.start ?? 0),
    end: start + (ch.end ?? 0),
    isVolume: false,
  }));
}

/**
 * 使用 TXT 目录规则（含可选 JS 标题净化）解析章节
 */
async function parseChaptersWithTxtTocRule(
  content: string,
  rule: string,
  replacement: string,
  charset: string,
  splitLongChapter = true,
  book?: Book,
): Promise<{ chapters: BookChapter[]; wordCount: number }> {
  if (!rule.trim()) {
    return parseChaptersWithoutRule(content, charset);
  }
  const jsBook = book ? toTxtTocJsBook(book) : undefined;
  const matches = await scanTxtTocMatches(content, rule, replacement, jsBook);
  if (matches.length === 0) {
    return { chapters: [], wordCount: 0 };
  }

  const chapters: BookChapter[] = [];
  let wordCount = 0;

  for (const match of matches) {
    const { index: chapterStart, title: chapterTitle, precedingContent, isVolume } = match;

    if (chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      const segStart = lastChapter.start ?? 0;
      const segEnd = chapterStart;
      const chapterContent = content.substring(segStart, segEnd);
      const segLen = segEnd - segStart;

      if (
        splitLongChapter &&
        !lastChapter.isVolume &&
        segLen > MAX_LENGTH_WITH_TOC
      ) {
        chapters.pop();
        const splitParts = splitOversizedChapter(
          content,
          segStart,
          segEnd,
          lastChapter.title,
          charset,
        );
        chapters.push(...splitParts);
        wordCount += segLen;
      } else {
        lastChapter.end = segEnd;
        if (!lastChapter.isVolume && chapterContent.trim() === '') {
          lastChapter.isVolume = true;
        }
        lastChapter.wordCount = formatWordCount(chapterContent.length);
        wordCount += chapterContent.length;
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
      start: chapterStart,
      end: chapterStart,
    });

    // 标题与正文之间无内容时，上一章为卷名（Legado isVolume 逻辑）
    if (chapters.length >= 2 && precedingContent.trim() === '') {
      const prev = chapters[chapters.length - 2];
      if (!prev.isVolume) prev.isVolume = true;
    }
  }

  if (chapters.length > 0) {
    const lastChapter = chapters[chapters.length - 1];
    const finalEnd = content.length;
    const chapterContent = content.substring(lastChapter.start ?? 0, finalEnd);

    if (
      splitLongChapter &&
      finalEnd - (lastChapter.start ?? 0) > MAX_LENGTH_WITH_TOC
    ) {
      const parentTitle = lastChapter.title;
      const parentStart = lastChapter.start ?? 0;
      chapters.pop();
      const splitParts = splitOversizedChapter(content, parentStart, finalEnd, parentTitle, charset);
      chapters.push(...splitParts);
      wordCount += chapterContent.length;
    } else {
      lastChapter.end = finalEnd;
      lastChapter.wordCount = formatWordCount(chapterContent.length);
      wordCount += chapterContent.length;
    }
  }

  chapters.forEach((chapter, index) => {
    chapter.index = index;
  });

  return { chapters, wordCount };
}

/**
 * 使用单规则解析章节（保留供 tocUrl 指定规则时使用）
 */
export function parseChaptersWithRule(
  content: string,
  rule: string,
  charset: string
): { chapters: BookChapter[]; wordCount: number } {
  const chapters: BookChapter[] = [];
  let wordCount = 0;

  try {
    const regex = new RegExp(rule, 'gm');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const chapterStart = match.index;
      const chapterTitle = match[0].trim();

      if (chapterTitle.length > 120) continue;

      if (chapters.length > 0) {
        const lastChapter = chapters[chapters.length - 1];
        lastChapter.end = chapterStart;
        const chapterContent = content.substring(lastChapter.start || 0, chapterStart);
        lastChapter.wordCount = formatWordCount(chapterContent.length);
        wordCount += chapterContent.length;
      }

      const isVol = /^第?[零一二三四五六七八九十百千万0-9]+[卷部篇本]/u.test(chapterTitle);
      chapters.push({
        url: '',
        title: chapterTitle,
        isVolume: isVol,
        baseUrl: '',
        bookUrl: '',
        index: chapters.length,
        isVip: false,
        isPay: false,
        start: chapterStart,
        end: chapterStart,
      });
    }

    if (chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      lastChapter.end = content.length;
      const chapterContent = content.substring(lastChapter.start || 0, content.length);
      lastChapter.wordCount = formatWordCount(chapterContent.length);
      wordCount += chapterContent.length;
    }

    chapters.forEach((chapter, index) => {
      chapter.index = index;
    });
  } catch (error) {
    console.error('使用规则解析章节失败，回退到无规则解析:', error);
    return parseChaptersWithoutRule(content, charset);
  }

  return { chapters, wordCount };
}

/**
 * 不使用规则解析章节（按固定长度分割）
 */
function parseChaptersWithoutRule(
  content: string,
  _charset: string
): { chapters: BookChapter[]; wordCount: number } {
  const chapters: BookChapter[] = [];
  let wordCount = content.length;
  const maxLength = MAX_LENGTH_WITH_NO_TOC;

  let currentOffset = 0;
  let chapterIndex = 0;

  while (currentOffset < content.length) {
    const remaining = content.length - currentOffset;
    let chapterLength = Math.min(remaining, maxLength);

    // 尝试在换行符处截断
    if (currentOffset + chapterLength < content.length) {
      const searchStart = currentOffset + chapterLength - 1000; // 向前搜索1KB
      const searchEnd = currentOffset + chapterLength;
      const lastNewline = content.lastIndexOf('\n', searchEnd);

      if (lastNewline > searchStart) {
        chapterLength = lastNewline - currentOffset + 1;
      }
    }

    const chapter: BookChapter = {
      url: '',
      title: `第${chapterIndex + 1}章`,
      isVolume: false,
      baseUrl: '',
      bookUrl: '',
      index: chapterIndex,
      isVip: false,
      isPay: false,
      start: currentOffset,
      end: currentOffset + chapterLength,
      wordCount: formatWordCount(chapterLength),
    };

    chapters.push(chapter);
    currentOffset += chapterLength;
    chapterIndex++;
  }

  return { chapters, wordCount };
}

/**
 * 从 ArrayBuffer 检测编码并解码（BOM 优先，再尝试 UTF-8 / GBK）
 * 在 Tauri 环境中，GBK 编码会使用 Rust 后端解码
 */
async function detectEncodingFromBuffer(buffer: ArrayBuffer): Promise<{ charset: string; text: string }> {
  const bytes = new Uint8Array(buffer);
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = new TextDecoder('utf-8').decode(bytes.subarray(3));
    return { charset: 'utf-8', text };
  }
  // UTF-16 LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
    return { charset: 'utf-16', text };
  }
  // UTF-16 BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
    return { charset: 'utf-16', text };
  }
  // 无 BOM：先尝试 UTF-8（fatal: true），失败则尝试 GBK 检测
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = decoder.decode(bytes);
    // 检查是否包含大量替换字符（说明可能是 GBK）
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    if (replacementCount > bytes.length * 0.1) {
      // 超过 10% 的替换字符，可能是 GBK
      console.warn('[编码检测] UTF-8 解码包含大量替换字符，可能是 GBK');
    }
    return { charset: 'utf-8', text };
  } catch {
    // UTF-8 解码失败，尝试检测 GBK 特征
    let gbkScore = 0;
    let totalGBKPairs = 0;
    for (let i = 0; i < bytes.length - 1; i++) {
      // GBK 双字节: 0x81-0xFE, 0x40-0xFE
      if (bytes[i] >= 0x81 && bytes[i] <= 0xFE) {
        totalGBKPairs++;
        if (bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE) {
          gbkScore++;
          i++; // 跳过第二个字节
        }
      }
    }

    // 如果 GBK 特征明显，尝试使用 Rust 后端解码（如果在 Tauri 环境中）
    if (totalGBKPairs > 0 && gbkScore / totalGBKPairs > 0.8) {
      try {
        if (isTauri()) {
          // 在 Tauri 环境中，使用 Rust 后端解码 GBK
          const decodedText = await invoke<string>('decode_gbk', { data: Array.from(bytes) });
          // console.log('[编码检测] 使用 Rust 后端成功解码 GBK');
          return { charset: 'gbk', text: decodedText };
        }
      } catch (e) {
        console.warn('[编码检测] Rust GBK 解码失败，使用 fallback:', e);
      }

      // 浏览器环境或无 Rust 后端，用 replacement 解码避免崩溃
      console.warn('[编码检测] 检测到 GBK 特征，但无法正确解码，使用 fallback');
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { charset: 'gbk', text };
    }

    // 否则尝试非 fatal UTF-8 解码
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { charset: 'utf-8', text };
  }
}

/**
 * 检测编码格式（仅当内容已是 string 时使用，如二次解析）
 */
async function detectEncoding(content: string | ArrayBuffer): Promise<string> {
  if (content instanceof ArrayBuffer) {
    const { charset } = await detectEncodingFromBuffer(content);
    return charset;
  }
  return 'utf-8';
}

/**
 * 查找下一个章节的索引
 */
function findNextChapterIndex(content: string, startIndex: number): number {
  for (const pattern of DEFAULT_CHAPTER_PATTERNS) {
    const regex = new RegExp(pattern.source, 'gm');
    regex.lastIndex = startIndex;
    const match = regex.exec(content);
    if (match) {
      return match.index;
    }
  }
  return -1;
}

/**
 * 格式化字数
 */
function formatWordCount(count: number): string {
  if (count < 1000) {
    return `${count}字`;
  } else if (count < 10000) {
    return `${(count / 1000).toFixed(1)}千字`;
  } else {
    return `${(count / 10000).toFixed(1)}万字`;
  }
}
