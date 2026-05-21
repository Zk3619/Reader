/**
 * 书源发现子项解析（分类、排行榜等）
 * 对应 legado 书源展开后显示的内容：exploreScreen 或默认发现
 */

import type { BookSource } from '@/types';
import { extractExploreScript, runExploreScript } from '@/lib/js-engine';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';

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
  /** 对象形 exploreScreen 下的子项（父级渲染为 Select） */
  children?: ExploreSection[];
  /** 可选布局样式（来自 API 的 style），用于发现页 flex 多列展示 */
  style?: ExploreSectionStyle;
  /** Legado 发现项类型，如 select 下拉筛选 */
  type?: string;
  /** select 选项列表 */
  chars?: string[];
  /** select 当前选中值 */
  default?: string;
  /** 写入书源变量 JSON 的字段名（如 server、find_tab） */
  paramKey?: string;
}

function extractParamKeyFromAction(action: unknown): string | undefined {
  if (typeof action !== 'string') return undefined;
  const m = action.match(/,\s*'([^']+)'\s*\)\s*$/);
  return m?.[1];
}

export function mapRawExploreItem(rec: Record<string, unknown>): ExploreSection | null {
  const title = rec.title ?? rec.name ?? rec.label;
  if (title == null || !String(title).trim()) return null;
  const url = rec.url ?? rec.link;
  const styleRaw = rec.style;
  let style: ExploreSectionStyle | undefined;
  if (styleRaw && typeof styleRaw === 'object' && !Array.isArray(styleRaw)) {
    const s = styleRaw as Record<string, unknown>;
    const grow = s.layout_flexGrow;
    const basis = s.layout_flexBasisPercent;
    if (typeof grow === 'number' || typeof basis === 'number') {
      style = {};
      if (typeof grow === 'number') style.layout_flexGrow = grow;
      if (typeof basis === 'number') style.layout_flexBasisPercent = basis;
    }
  }
  const type = typeof rec.type === 'string' ? rec.type : undefined;
  const chars = Array.isArray(rec.chars)
    ? rec.chars.map((c) => String(c))
    : undefined;
  const defaultVal =
    rec.default != null ? String(rec.default) : chars?.[0];
  const paramKey =
    typeof rec.paramKey === 'string'
      ? rec.paramKey
      : extractParamKeyFromAction(rec.action);
  return {
    title: String(title).trim(),
    url: typeof url === 'string' ? url : undefined,
    style,
    type,
    chars,
    default: defaultVal,
    paramKey,
  };
}

/** 更新发现脚本用的书源变量（对齐 Legado setArguments / show） */
export function updateExploreSourceArgument(
  source: BookSource,
  paramKey: string,
  value: string
): void {
  const argsKey = getSourceArgsKey(source);
  let data: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(argsKey);
    if (raw) data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  data[paramKey] = value;
  if (paramKey === 'find_tab') {
    data.tab = value;
    data.find_source = '番茄';
  }
  if (paramKey === 'find_source') {
    data.sources = value;
  }
  try {
    localStorage.setItem(argsKey, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * 尝试将 JSON 文本解析为发现子项列表
 * legado 格式：JSON 数组，每项含 { title, url, style? }
 * @returns 解析后的 ExploreSection[]，解析失败返回 null
 */
/**
 * 对象形发现配置：`"父级": { "子级": "url", ... }` 或 `"父级": "url"`
 */
function tryParseObjectSections(jsonStr: string): ExploreSection[] | null {
  try {
    const raw = JSON.parse(jsonStr.trim()) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const sections: ExploreSection[] = [];
    for (const [parentTitle, childVal] of Object.entries(raw as Record<string, unknown>)) {
      if (childVal && typeof childVal === 'object' && !Array.isArray(childVal)) {
        const rec = childVal as Record<string, unknown>;
        const children: ExploreSection[] = [];
        let parentUrl: string | undefined;
        for (const [childTitle, childUrl] of Object.entries(rec)) {
          if (childTitle === 'url' || childTitle === 'link') {
            if (typeof childUrl === 'string') parentUrl = childUrl;
            continue;
          }
          if (typeof childUrl === 'string') {
            children.push({ title: String(childTitle).trim(), url: childUrl });
          } else if (childUrl && typeof childUrl === 'object') {
            const mapped = mapRawExploreItem({
              title: childTitle,
              ...(childUrl as Record<string, unknown>),
            });
            if (mapped) children.push(mapped);
          }
        }
        if (children.length > 0) {
          sections.push({
            title: String(parentTitle).trim(),
            url: parentUrl,
            children,
          });
        }
        continue;
      }
      if (typeof childVal === 'string') {
        sections.push({ title: String(parentTitle).trim(), url: childVal });
        continue;
      }
      const mapped = mapRawExploreItem({ title: parentTitle, url: childVal });
      if (mapped) sections.push(mapped);
    }
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

function tryParseJsonSections(jsonStr: string): ExploreSection[] | null {
  try {
    const raw = JSON.parse(jsonStr.trim()) as unknown;
    if (!raw) return null;
    if (!Array.isArray(raw)) {
      return tryParseObjectSections(jsonStr);
    }
    const sections: ExploreSection[] = [];
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const mapped = mapRawExploreItem(item as Record<string, unknown>);
        if (mapped) sections.push(mapped);
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
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
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

const exploreSectionsMemCache = new Map<string, ExploreSection[]>();

function exploreSectionsCacheKey(source: BookSource, argsVersion: number): string {
  return `${source.sourceUrl}\0${argsVersion}`;
}

/** 清除某书源的发现脚本缓存（书源更新后可选调用） */
export function clearExploreSectionsCache(sourceUrl?: string): void {
  if (!sourceUrl) {
    exploreSectionsMemCache.clear();
    return;
  }
  for (const key of exploreSectionsMemCache.keys()) {
    if (key.startsWith(`${sourceUrl}\0`)) exploreSectionsMemCache.delete(key);
  }
}

/**
 * 异步获取发现子项：若 exploreUrl 为 <js>...</js> 则在前端执行脚本后返回分类列表
 * @param argsVersion 书源变量版本，变更筛选后递增以使缓存失效
 */
export async function getExploreSectionsAsync(
  source: BookSource,
  argsVersion = 0
): Promise<ExploreSection[]> {
  const script = extractExploreScript(source.exploreUrl);
  if (script) {
    const cacheKey = exploreSectionsCacheKey(source, argsVersion);
    const hit = exploreSectionsMemCache.get(cacheKey);
    if (hit) return hit;

    try {
      const sections = await runExploreScript(script, source);
      if (sections.length > 0) {
        exploreSectionsMemCache.set(cacheKey, sections);
        return sections;
      }
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

/** createResource 返回值（含 loading / state） */
export type ExploreSectionsResource = {
  state: string;
  loading: boolean;
  (): ExploreSection[] | undefined;
};

/** 脚本分类 resource：仅在 ready 且非 loading 时返回数据，重载期间为空以展示完整骨架屏 */
export function resolveExploreSectionsFromResource(resource: ExploreSectionsResource): ExploreSection[] {
  if (resource.state === 'ready' && !resource.loading) return resource() ?? [];
  return [];
}

/** 脚本分类是否处于加载/重载（含 refreshing、loading，不仅 pending） */
export function isExploreSectionsResourcePending(
  usesScriptExplore: boolean,
  resource: ExploreSectionsResource,
): boolean {
  if (!usesScriptExplore) return false;
  if (resource.state === 'errored') return false;
  return (
    resource.loading ||
    resource.state === 'pending' ||
    resource.state === 'refreshing' ||
    resource.state === 'unresolved'
  );
}

/** 筛选版本已变更但 resource 尚未对齐（Solid 重载时可能仍为 ready） */
export function isExploreSectionsVersionStale(
  currentVersion: number,
  loadedVersion: number,
): boolean {
  return currentVersion !== loadedVersion;
}

/** 探索/书源页脚本分类是否应显示骨架屏 */
export function shouldShowExploreSectionsSkeleton(
  usesScriptExplore: boolean,
  currentVersion: number,
  loadedVersion: number,
  resource: ExploreSectionsResource,
): boolean {
  if (!usesScriptExplore) return false;
  if (isExploreSectionsVersionStale(currentVersion, loadedVersion)) return true;
  return isExploreSectionsResourcePending(usesScriptExplore, resource);
}
