/**
 * 书源发现子项解析（分类、排行榜等）
 * 对应 legado 书源展开后显示的内容：exploreScreen 或默认发现
 */

import type { BookSource } from '@/types';
import { extractExploreScript, runExploreScript } from './explore-script-runner';

/** Legado 发现项布局样式（flex），用于多列/占比显示 */
export interface ExploreSectionStyle {
  layout_flexGrow?: number;
  layout_flexBasisPercent?: number;
}

export interface ExploreSection {
  /** 显示名称，如 推荐、排行榜、玄幻 */
  title: string;
  /** 该分类的发现 URL，可选（缺省时使用书源 exploreUrl） */
  url?: string;
  /** 可选布局样式（来自 API 的 style），用于发现页 flex 多列展示 */
  style?: ExploreSectionStyle;
}

/**
 * 尝试将 JSON 文本解析为发现子项列表
 * legado 格式：JSON 数组，每项含 { title, url, style? }
 * @returns 解析后的 ExploreSection[]，解析失败返回 null
 */
function tryParseJsonSections(jsonStr: string): ExploreSection[] | null {
  try {
    const raw = JSON.parse(jsonStr.trim()) as unknown;
    if (!Array.isArray(raw)) return null;
    const sections: ExploreSection[] = [];
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const title = rec.title ?? rec.name;
        const url = rec.url;
        const style = rec.style as ExploreSectionStyle | undefined;
        if (title && typeof title === 'string') {
          sections.push({
            title: String(title).trim(),
            url: typeof url === 'string' ? url : undefined,
            style,
          });
        }
      }
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

/**
 * 从书源解析发现子项列表（分类、排行榜等）- 同步，不执行脚本
 * - 若有 exploreScreen（legado 格式 JSON 数组，项含 title/url），解析后返回
 * - 若 exploreUrl 也是 JSON 数组格式（legado 标准做法），同样解析后返回
 * - 若无以上但有 exploreUrl + ruleExplore，返回单条「发现」
 * - 否则返回空数组
 */
export function getExploreSections(source: BookSource): ExploreSection[] {
  // 1. 优先从 exploreScreen 解析
  if (source.exploreScreen && typeof source.exploreScreen === 'string' && source.exploreScreen.trim()) {
    const sections = tryParseJsonSections(source.exploreScreen);
    if (sections) return sections;
  }

  // 2. 尝试将 exploreUrl 作为 JSON 数组解析（legado 中 exploreUrl 也可以是 JSON 数组）
  if (source.exploreUrl && typeof source.exploreUrl === 'string') {
    const trimmed = source.exploreUrl.trim();
    // 只有以 [ 开头时才尝试解析为 JSON 数组，避免误解析普通 URL 或 <js> 脚本
    if (trimmed.startsWith('[')) {
      const sections = tryParseJsonSections(trimmed);
      if (sections) return sections;
    }
  }

  // 3. 回退：有 exploreUrl + ruleExplore 时返回单条「发现」
  if (source.exploreUrl && source.ruleExplore) {
    return [{ title: '发现', url: source.exploreUrl }];
  }
  return [];
}

/**
 * 异步获取发现子项：若 exploreUrl 为 <js>...</js> 则在前端执行脚本后返回分类列表
 */
export async function getExploreSectionsAsync(source: BookSource): Promise<ExploreSection[]> {
  const script = extractExploreScript(source.exploreUrl);
  if (script) {
    try {
      const sections = await runExploreScript(script, source);
      if (sections.length > 0) return sections;
    } catch (e) {
      console.warn('[getExploreSectionsAsync] script run failed:', e);
    }
    return [{ title: '发现', url: source.exploreUrl }];
  }
  return getExploreSections(source);
}

/** 书源发现是否由脚本动态生成（exploreUrl 为 <js>... 形式，需异步执行脚本得到分类列表） */
export function isExploreUrlScript(exploreUrl: string | undefined): boolean {
  return typeof exploreUrl === 'string' && exploreUrl.trimStart().startsWith('<js>');
}
