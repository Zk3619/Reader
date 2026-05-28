/**
 * 书源章节列表功能
 * 对应 legado 项目的 WebBook.getChapterList
 *
 * 支持两种场景：
 * 1. tocUrl 是标准 HTTP(S) URL → 直接请求，用 ruleToc 解析
 * 2. tocUrl 是 data: URL → 解码内容，提取 book_id 等参数，
 *    构建 ${server}/catalog?book_id=... 请求后解析（模拟 legado ruleToc.chapterList init）
 */

import { post } from '@/lib/http';
import { analyzeListElements, analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, TocRule } from '@/types';
import type { BookChapter, NewBookChapter } from '@/types';
import {
  buildSourceRequestHeaders,
  resolveAggregationServerUrl,
} from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType, decodeDataUrl } from '@/lib/book-source/utils';
import { settingsStore } from '@/stores/settings';
import { evalJs } from '@/lib/js-engine';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';

const DEFAULT_TOC_PAGINATION_MAX_PAGES = 80;
const HARD_TOC_PAGINATION_MAX_PAGES = 5000;

function getTocPaginationSafetyOptions(): { enabled: boolean; maxPages: number } {
  const app = settingsStore.state.app;
  const enabled = app.tocPaginationSafetyEnabled !== false;
  const rawMax = app.tocPaginationMaxPages;
  const maxPages =
    typeof rawMax === 'number' && Number.isFinite(rawMax)
      ? Math.max(1, Math.min(HARD_TOC_PAGINATION_MAX_PAGES, Math.floor(rawMax)))
      : DEFAULT_TOC_PAGINATION_MAX_PAGES;
  return { enabled, maxPages };
}

async function notifyTocPaginationSafetyHit(payload: {
  sourceName: string;
  maxPages: number;
  tocUrl: string;
  truncatedPages: number;
  pendingPages: number;
}) {
  try {
    const { showAppToast } = await import('@/components/shared/AppToasts');
    showAppToast({
      title: '目录分页达到安全阈值，已停止继续抓取',
      description:
        `[${payload.sourceName}] 最大页数 ${payload.maxPages}；` +
        `被截断页数 ${payload.truncatedPages}；待抓取页数 ${payload.pendingPages}；` +
        `入口：${payload.tocUrl}`,
      variant: 'default',
    });
  } catch (e) {
    console.warn('[chapters] AppToast 通知失败:', e);
  }
}

async function applyPreUpdateJs(
  source: BookSource,
  rule: TocRule,
  html: string,
  currentTocUrl: string,
): Promise<string> {
  const preUpdateJs = rule.preUpdateJs?.trim();
  if (!preUpdateJs) return html;
  try {
    const context: RuleContext = {
      content: html,
      contentType: detectContentType(html),
      baseUrl: currentTocUrl,
      result: html,
      source: source as unknown as Record<string, unknown>,
    };
    const output = await analyzeString(preUpdateJs, context);
    const next = output.trim();
    return next ? next : html;
  } catch (error) {
    console.warn('[chapters] preUpdateJs 执行失败，回退原始目录内容:', error);
    return html;
  }
}

async function applyFormatJs(
  source: BookSource,
  rule: TocRule,
  chapters: BookChapter[],
  currentTocUrl: string,
): Promise<BookChapter[]> {
  const formatJs = rule.formatJs?.trim();
  if (!formatJs || chapters.length === 0) return chapters;
  try {
    const jsResult = await evalJs(formatJs, {
      result: chapters,
      baseUrl: currentTocUrl,
      source: source as unknown as Record<string, unknown>,
    });
    if (!Array.isArray(jsResult)) return chapters;

    const normalized: BookChapter[] = [];
    for (const rawItem of jsResult) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const row = rawItem as Record<string, unknown>;
      const title = String(row.title ?? row.chapterName ?? '').trim();
      const url = String(row.url ?? row.chapterUrl ?? '').trim();
      if (!title || !url) continue;
      normalized.push({
        url: resolveUrl(currentTocUrl, url),
        title,
        isVolume: Boolean(row.isVolume),
        baseUrl: currentTocUrl,
        bookUrl: '',
        index: normalized.length,
        isVip: Boolean(row.isVip),
        isPay: Boolean(row.isPay),
        wordCount: row.wordCount == null ? undefined : String(row.wordCount),
      });
    }
    return normalized.length > 0 ? normalized : chapters;
  } catch (error) {
    console.warn('[chapters] formatJs 执行失败，保留原始目录解析结果:', error);
    return chapters;
  }
}

// ─── data: URL 场景 ───

/**
 * 处理 data: URL 场景的章节列表获取
 * 模拟 legado ruleToc.chapterList 中 JS 规则的行为：
 *   1. 解码 data URL → 提取 book_id / sources / tab
 *   2. 从 jsLib 获取 server 地址
 *   3. POST ${server}/catalog?book_id=...&source=...&tab=...
 *   4. 解析返回的 JSON data 数组为 BookChapter[]
 */
async function getChapterListFromDataUrl(
  source: BookSource,
  tocUrl: string,
): Promise<BookChapter[]> {
  // 1. 解码 data URL
  const payload = decodeDataUrl(tocUrl);
  if (!payload) {
    console.warn('[chapters] 无法解码 data URL');
    return [];
  }
  console.log('[chapters] data URL 载荷:', payload);

  const bookId = payload.book_id;
  if (!bookId) {
    console.warn('[chapters] data URL 中没有 book_id');
    return [];
  }

  // 2. 确定 server 地址（优先用户所选线路）
  const serverUrl = resolveAggregationServerUrl(source);
  if (!serverUrl) {
    console.warn('[chapters] 无法从书源获取 server 地址');
    return [];
  }

  // 3. 构建目录 API URL（模拟 ruleToc.chapterList 中的 java.ajax 调用）
  const sources = payload.sources || payload.source || '';
  const tab = payload.tab || '';
  const catalogUrl = `${serverUrl}/catalog?book_id=${encodeURIComponent(bookId)}&source=${encodeURIComponent(sources)}&tab=${encodeURIComponent(tab)}`;
  console.log('[chapters] 请求目录 API:', catalogUrl);

  // 4. POST 请求（书源规则用 POST + body: { html: "" }）
  const headers = buildSourceRequestHeaders(source, catalogUrl);
  const responseText = await post(
    catalogUrl,
    JSON.stringify({ html: '' }),
    {
      headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 30000,
    },
  );
  await assertLoginCheckPassed(source, responseText, catalogUrl);

  const response = JSON.parse(responseText);
  if (response.code !== 0 || !response.data || !Array.isArray(response.data)) {
    console.warn('[chapters] 目录 API 返回异常:', response.msg || response);
    return [];
  }

  console.log('[chapters] 获取到章节数:', response.data.length);

  // 5. 将 API 响应映射为 BookChapter[]
  const chapters: BookChapter[] = response.data.map(
    (item: Record<string, string>, index: number) => {
      // 构建章节内容 URL：与书源 chapterUrl 规则一致，用 data: URL 编码
      const chapterPayload = {
        book_id: bookId,
        item_id: item.item_id || '',
        title: item.title || '',
        sources: item.source || sources,
        tab: item.tab || tab,
        url: item.toc_url || '',
      };
      const chapterDataUrl = `data:;base64,${btoa(
        String.fromCharCode(...new TextEncoder().encode(JSON.stringify(chapterPayload))),
      )},{"type":"qingtian3"}`;

      return {
        url: chapterDataUrl,
        title: (item.title || '').trim(),
        isVolume: false,
        baseUrl: tocUrl,
        bookUrl: '', // 由调用方设置
        index,
        isVip: false,
        isPay: false,
        wordCount: undefined,
      } satisfies BookChapter;
    },
  );

  return chapters;
}

// ─── 标准 HTTP URL 场景 ───

/**
 * 获取章节列表
 * 自动检测 tocUrl 类型，选择对应的处理路径
 */
export async function getChapterList(
  source: BookSource,
  tocUrl: string
): Promise<BookChapter[]> {
  if (!source.ruleToc) {
    return [];
  }

  try {
    // ── data: URL 路径 ──
    if (tocUrl.startsWith('data:')) {
      return await getChapterListFromDataUrl(source, tocUrl);
    }

    // ── 标准 HTTP URL 路径 ──
    const rule = source.ruleToc;

    const chapters: BookChapter[] = [];
    const seenChapterUrls = new Set<string>();
    const seenTocPages = new Set<string>();
    const pendingTocPages: string[] = [tocUrl];
    const tocSafety = getTocPaginationSafetyOptions();
    let safetyNotified = false;
    const { fetchSourcePage } = await import('@/lib/book-source/fetch-source-page');

    while (pendingTocPages.length > 0) {
      if (tocSafety.enabled && seenTocPages.size >= tocSafety.maxPages) {
        const pendingPages = pendingTocPages.length;
        const truncatedPages = pendingPages;
        if (!safetyNotified) {
          safetyNotified = true;
          void notifyTocPaginationSafetyHit({
            sourceName: source.sourceName,
            maxPages: tocSafety.maxPages,
            tocUrl,
            truncatedPages,
            pendingPages,
          });
        }
        console.warn('[chapters] 目录分页达到安全阈值，停止继续抓取', {
          source: source.sourceName,
          maxPages: tocSafety.maxPages,
          seedTocUrl: tocUrl,
          pendingCount: pendingPages,
          truncatedPages,
        });
        break;
      }

      const currentTocUrl = pendingTocPages.shift()!;
      if (seenTocPages.has(currentTocUrl)) continue;
      seenTocPages.add(currentTocUrl);

      console.log('[chapters] 请求目录 URL:', currentTocUrl);
      const fetched = await fetchSourcePage({
        ruleUrl: currentTocUrl,
        source,
        baseUrl: source.sourceUrl,
      });
      const html = await applyPreUpdateJs(source, rule, fetched.body, currentTocUrl);
      const contentType = detectContentType(html);
      console.log(
        '[chapters] 目录 API 响应类型:',
        contentType,
        '长度:',
        html.length,
        '前100字符:',
        html.substring(0, 100),
      );

      // 处理 init 规则（如 "$.data"）：先导航到 JSON 子节点再应用其他规则
      let contextContent = html;
      if ((rule as unknown as { init?: string }).init && contentType === 'json') {
        try {
          const initResult = await analyzeString((rule as unknown as { init: string }).init, {
            content: html,
            contentType,
            baseUrl: currentTocUrl,
            source: source as unknown as Record<string, unknown>,
          });
          if (initResult) {
            contextContent = initResult;
            console.log('[chapters] init 规则执行结果长度:', initResult.length);
          }
        } catch (e) {
          console.warn('[chapters] init 规则执行失败:', e);
        }
      }

      // 创建规则上下文
      const context: RuleContext = {
        content: contextContent,
        contentType: detectContentType(contextContent),
        baseUrl: currentTocUrl,
        source: source as unknown as Record<string, unknown>,
      };

      const pageChapters: BookChapter[] = [];

      if (rule.chapterList) {
        let chapterListRule = rule.chapterList;
        if (!chapterListRule.includes('@')) {
          chapterListRule = `${chapterListRule}@all`;
        }

        const listItems = await analyzeListElements(chapterListRule, context);
        console.log('[chapters] 提取到章节元素数:', listItems.length);

        for (const item of listItems) {
          const elementContext: RuleContext = {
            content: item.content,
            contentType: context.contentType,
            baseUrl: currentTocUrl,
            source: source as unknown as Record<string, unknown>,
            regexGroups: item.regexGroups,
            result: typeof item.rawValue === 'string' ? item.rawValue : item.content,
          };

          const chapter = await parseChapter(
            source,
            rule,
            elementContext,
            currentTocUrl,
            chapters.length,
          );
          if (chapter && !seenChapterUrls.has(chapter.url)) {
            seenChapterUrls.add(chapter.url);
            pageChapters.push(chapter);
          }
        }
      } else {
        const chapter = await parseChapter(source, rule, context, currentTocUrl, chapters.length);
        if (chapter && !seenChapterUrls.has(chapter.url)) {
          seenChapterUrls.add(chapter.url);
          pageChapters.push(chapter);
        }
      }

      const finalPageChapters = await applyFormatJs(source, rule, pageChapters, currentTocUrl);
      chapters.push(...finalPageChapters.map((chapter, idx) => ({
        ...chapter,
        index: chapters.length + idx,
      })));

      // Legado 目录分页：nextTocUrl 可能返回单个/多个 URL（含 JS 数组）。
      if (rule.nextTocUrl?.trim()) {
        try {
          const nextRawList = await analyzeStringList(rule.nextTocUrl, context);
          const candidates = normalizeNextTocCandidates(nextRawList, currentTocUrl);
          for (const n of candidates) {
            if (!seenTocPages.has(n)) pendingTocPages.push(n);
          }
        } catch (e) {
          console.warn('[chapters] nextTocUrl 解析失败:', e);
        }
      }
    }

    // 注意：目录倒序功能通常在阅读配置中处理，这里不处理

    return chapters;
  } catch (error) {
    console.error(`获取章节列表失败 [${source.sourceName}]:`, error);
    return [];
  }
}

/**
 * 解析单个章节
 */
async function parseChapter(
  _source: BookSource,
  rule: TocRule,
  context: RuleContext,
  baseUrl: string,
  index: number
): Promise<BookChapter | null> {
  try {
    let title = rule.chapterName ? await analyzeString(rule.chapterName, context) : '';
    const url = rule.chapterUrl ? await analyzeString(rule.chapterUrl, context) : '';

    // Legado 兼容容错：部分站点章节名规则在编码/替换后可能被清空，
    // 但章节 URL 已解析成功。此时回退到锚点文本，避免整章被丢弃。
    if (!title && url && context.contentType === 'html') {
      const escapedUrl = url.replace(/"/g, '\\"');
      const fallbackRules = [
        `a[href="${escapedUrl}"]@text`,
        `a[href="${escapedUrl}"]@ownText`,
        'a@text',
        'a@ownText',
        '@text',
      ];
      for (const r of fallbackRules) {
        const v = (await analyzeString(r, context)).trim();
        if (v) {
          title = v;
          break;
        }
      }
    }

    if (index < 3) {
      console.log(`[chapters] parseChapter[${index}]:`, {
        title,
        url,
        contentType: context.contentType,
        contentPreview: context.content.substring(0, 100),
        chapterUrlRule: rule.chapterUrl,
      });
    }

    if (!title || !url) {
      if (index < 3) {
        console.warn(`[chapters] parseChapter[${index}] 缺少必要字段:`, { title: !!title, url: !!url });
      }
      return null;
    }

    // 判断是否是卷（通常标题包含特定标识或规则中有isVolume）
    let isVolume = false;
    if (rule.isVolume) {
      const volumeResult = await analyzeString(rule.isVolume, context);
      isVolume = Boolean(volumeResult && volumeResult.trim() !== '');
    } else {
      // 默认判断：如果标题看起来像卷名（如"第一卷"、"第一章"等）
      isVolume = /^第?[一二三四五六七八九十百千万\d]+[卷部篇]/u.test(title);
    }

    // 解析章节URL
    const chapterUrl = resolveUrl(baseUrl, url);

    // 解析其他字段
    // 注意：TocRule中没有chapterWordCount字段，如果需要可以从其他规则中获取
    const wordCount = undefined;
    const isVip = rule.isVip
      ? Boolean(await analyzeString(rule.isVip, context))
      : false;
    const isPay = rule.isPay
      ? Boolean(await analyzeString(rule.isPay, context))
      : false;

    return {
      url: chapterUrl,
      title: title.trim(),
      isVolume,
      baseUrl,
      bookUrl: '', // 这个会在调用时设置
      index,
      isVip,
      isPay,
      wordCount,
    };
  } catch (error) {
    console.error('解析章节失败:', error);
    return null;
  }
}

function normalizeNextTocCandidates(rawList: string[], baseUrl: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (!t || t === '#' || t.startsWith('javascript:')) return;
    const abs = resolveUrl(baseUrl, t);
    if (!abs || abs === baseUrl) return;
    out.push(abs);
  };

  for (const raw of rawList) {
    const t = raw.trim();
    if (!t) continue;

    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const arr = JSON.parse(t) as unknown[];
        if (Array.isArray(arr)) {
          for (const v of arr) {
            if (typeof v === 'string') push(v);
          }
          continue;
        }
      } catch {
        /* ignore */
      }
    }

    if (t.includes('\n')) {
      for (const line of t.split('\n')) push(line);
      continue;
    }

    if (t.includes(',') && /https?:\/\/|\.html/.test(t)) {
      for (const seg of t.split(',')) push(seg);
      continue;
    }

    push(t);
  }

  return Array.from(new Set(out));
}

/**
 * 将BookChapter转换为NewBookChapter（用于数据库插入）
 */
export function toNewBookChapter(
  chapter: BookChapter,
  bookUrl: string
): NewBookChapter {
  return {
    url: chapter.url,
    title: chapter.title,
    isVolume: chapter.isVolume,
    baseUrl: chapter.baseUrl,
    bookUrl,
    index: chapter.index,
    isVip: chapter.isVip,
    isPay: chapter.isPay,
    wordCount: chapter.wordCount,
  };
}
