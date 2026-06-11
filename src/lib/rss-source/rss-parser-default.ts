/**
 * RSS默认解析器
 * 对应 legado 项目的 RssParserDefault.kt
 * 
 * 用于解析标准RSS XML格式（当ruleArticles为空时）
 */

import * as cheerio from 'cheerio';
import type { RssArticle, RssSource } from '@/types';
import { rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

/**
 * 解析标准RSS XML
 */
export function parseRssDefault(
  xml: string,
  sortName: string,
  sourceUrl: string,
  source?: RssSource | string,
): RssArticle[] {
  const logCtx = source ?? sourceUrl;

  if (!xml) {
    rssWarn(logCtx, '默认解析：输入为空');
    return [];
  }

  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles: RssArticle[] = [];
    let rss2Count = 0;

    // 解析RSS 2.0格式
    $('item').each((index, element) => {
      const $item = $(element);
      const title = $item.find('title').text().trim();
      const link = $item.find('link').text().trim();
      const pubDate = $item.find('pubDate').text().trim();
      const description = $item.find('description').text().trim();
      
      // 查找图片（可能在enclosure或media:content中）
      let image: string | undefined;
      const enclosure = $item.find('enclosure[type^="image"]').attr('url');
      const mediaContent = $item.find('media\\:content, content').attr('url');
      image = enclosure || mediaContent;

      if (title && link) {
        rss2Count += 1;
        articles.push({
          origin: sourceUrl,
          link,
          sort: sortName,
          title,
          order: index,
          pubDate: pubDate || undefined,
          description: description || undefined,
          image: image || undefined,
          group: '默认分组',
          read: false,
          type: 0,
          durPos: 0,
        });
      }
    });

    if (rss2Count > 0) {
      rssLog(logCtx, '默认解析：RSS 2.0', { itemCount: rss2Count });
    }

    // 如果RSS 2.0格式没有找到，尝试Atom格式
    if (articles.length === 0) {
      let atomCount = 0;
      $('entry').each((index, element) => {
        const $entry = $(element);
        const title = $entry.find('title').text().trim();
        const link = $entry.find('link').attr('href') || $entry.find('link').text().trim();
        const published = $entry.find('published').text().trim() || $entry.find('updated').text().trim();
        const summary = $entry.find('summary').text().trim() || $entry.find('content').text().trim();
        
        // 查找图片
        let image: string | undefined;
        const mediaThumbnail = $entry.find('media\\:thumbnail, thumbnail').attr('url');
        image = mediaThumbnail;

        if (title && link) {
          atomCount += 1;
          articles.push({
            origin: sourceUrl,
            link,
            sort: sortName,
            title,
            order: index,
            pubDate: published || undefined,
            description: summary || undefined,
            image: image || undefined,
            group: '默认分组',
            read: false,
            type: 0,
            durPos: 0,
          });
        }
      });
      if (atomCount > 0) {
        rssLog(logCtx, '默认解析：Atom', { entryCount: atomCount });
      } else {
        rssWarn(logCtx, '默认解析：未找到 RSS item 或 Atom entry', {
          xmlLength: xml.length,
        });
      }
    }

    return articles;
  } catch (error) {
    rssWarn(logCtx, '默认解析 XML 异常', { error: String(error) });
    return [];
  }
}
