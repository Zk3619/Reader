/**
 * RSS默认解析器
 * 对应 legado 项目的 RssParserDefault.kt
 * 
 * 用于解析标准RSS XML格式（当ruleArticles为空时）
 */

import * as cheerio from 'cheerio';
import type { RssArticle } from '@/types';

/**
 * 解析标准RSS XML
 */
export function parseRssDefault(
  xml: string,
  sortName: string,
  sourceUrl: string
): RssArticle[] {
  if (!xml) {
    return [];
  }

  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    const articles: RssArticle[] = [];

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

    // 如果RSS 2.0格式没有找到，尝试Atom格式
    if (articles.length === 0) {
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
    }

    return articles;
  } catch (error) {
    console.error('解析RSS XML失败:', error);
    return [];
  }
}
