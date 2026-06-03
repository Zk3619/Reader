/**
 * 发现列表 JSON 书籍对象的常见字段回退（对齐 Legado / 晴天聚合等书源）
 */

import { analyzeString, type RuleContext } from '@/lib/rule-engine';

/** 封面：聚合/JSON 列表常见 thumb_url、cover_url 等 */
export const COVER_JSON_PATHS = [
  '$.thumb_url',
  '$.cover_url',
  '$.cover',
  '$.book_cover',
  '$.img',
  '$.image',
] as const;

/** 简介：列表接口字段名不一，详情多为 abstract */
export const EXPLORE_INTRO_JSON_PATHS = [
  '$.abstract',
  '$.desc',
  '$.description',
  '$.intro',
  '$.book_intro',
  '$.summary',
  '$.book_desc',
] as const;

/** 最新章节标题 */
export const EXPLORE_LAST_CHAPTER_JSON_PATHS = [
  '$.last_chapter_title',
  '$.latest_chapter_title',
  '$.chapter_title',
  '$.last_chapter',
  '$.new_chapter_title',
] as const;

/** 作者：看漫画等 API 为 comic_author */
export const EXPLORE_AUTHOR_JSON_PATHS = [
  '$.comic_author',
  '$.author',
  '$.book_author',
] as const;

/** 更新时间（晴天聚合为 last_chapter_update_time，部分书源规则误写 last_update_time） */
export const EXPLORE_UPDATE_TIME_JSON_PATHS = [
  '$.last_chapter_update_time',
  '$.last_update_time',
  '$.update_time',
  '$.updated_at',
] as const;

export async function pickFirstJsonField(
  context: RuleContext,
  paths: readonly string[]
): Promise<string | undefined> {
  if (context.contentType !== 'json') return undefined;
  for (const path of paths) {
    const v = (await analyzeString(path, context)).trim();
    if (v) return v;
  }
  return undefined;
}
