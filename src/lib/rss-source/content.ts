/**
 * RSS文章内容功能
 * 对应 legado 项目的 Rss.getContent
 */

import { get } from '@/lib/http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { RssSource } from '@/types';
import type { RssArticle } from '@/types';
import { parseHeaders, detectContentType } from '@/lib/book-source/utils';
import { processContent } from '@/lib/book-source/content-processor';

/**
 * 获取RSS文章正文内容
 */
export async function getRssContent(
  source: RssSource,
  article: RssArticle
): Promise<string | null> {
  if (!source.ruleContent) {
    // 如果没有正文规则，返回描述或空
    return article.description || null;
  }

  try {
    // 发起请求
    const headers = parseHeaders(source.header);
    const html = await get(article.link, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 60000,
    });

    const contentType = detectContentType(html);

    // 创建规则上下文
    const context: RuleContext = {
      content: html,
      contentType,
      baseUrl: article.origin,
      result: html,
      source: source as unknown as Record<string, unknown>,
    };

    // 解析正文内容
    let content = await analyzeString(source.ruleContent, context);

    if (!content || content.trim().length === 0) {
      // 如果正文为空，返回描述
      return article.description || null;
    }

    // 清理内容
    content = cleanContent(content);

    // 应用替换规则
    content = await processContent(content, article.title, source.sourceUrl);

    return content;
  } catch (error) {
    console.error(`获取RSS文章内容失败 [${source.sourceName}]:`, error);
    // 失败时返回描述
    return article.description || null;
  }
}

/**
 * 清理RSS内容
 */
function cleanContent(content: string): string {
  // 移除多余的空白字符
  content = content.replace(/\r\n/g, '\n');
  content = content.replace(/\r/g, '\n');
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.replace(/[ \t]+/g, ' ');

  // 移除HTML标签残留（但保留必要的标签如img, a等）
  // 这里简化处理，实际可能需要更复杂的HTML清理
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  return content.trim();
}
