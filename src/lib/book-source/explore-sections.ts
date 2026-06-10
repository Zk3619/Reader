/**
 * 书源发现子项解析（分类、排行榜等）
 * 对应 legado 书源展开后显示的内容：exploreScreen 或默认发现
 */

import type { BookSource } from '@/types';
import { extractExploreScript, runExploreScript } from '@/lib/js-engine';
import { createScriptNoticeBus } from '@/lib/book-source/rate-limit-guard';
import {
  normalizeBookSourceServerUrl,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import {
  getSourceArgsKey,
  getLegadoSourceKey,
  isLegadoServerArgKey,
  normalizeServerFieldsInSourceArgs,
  persistSourceArgsJson,
  syncLegadoServerArgKeys,
} from '@/lib/js-engine/legado/source-script-shared';
import { getExploreInfoMap, setExploreInfoMapValue } from '@/lib/book-source/explore-info-map-store';

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
  /** Legado 发现项 action（select/button 变更时执行的 JS） */
  action?: string;
}

function extractParamKeyFromAction(action: unknown): string | undefined {
  if (typeof action !== 'string') return undefined;
  const trimmed = action.trim();
  const showMatch = trimmed.match(/,\s*'([^']+)'\s*\)\s*$/);
  if (showMatch?.[1]) return showMatch[1];
  const setArgsMatch = trimmed.match(/setArguments\s*\(\s*'([^']+)'/);
  if (setArgsMatch?.[1]) return setArgsMatch[1];
  return undefined;
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
  const action = typeof rec.action === 'string' ? rec.action : undefined;
  return {
    title: String(title).trim(),
    url: typeof url === 'string' ? url : undefined,
    style,
    type,
    chars,
    default: defaultVal,
    paramKey,
    action,
  };
}

/** 发现抽屉/导航：Legado type=select 且具备选项与 paramKey（或可从 action 解析） */
export function isExploreDrawerSelectSection(section: ExploreSection): boolean {
  return (
    section.type === 'select' &&
    !!section.chars &&
    section.chars.length > 0 &&
    !!(section.paramKey || section.action)
  );
}

/** 发现抽屉：Legado type=button 且带 action（无 url 时仍应可点击） */
export function isExploreDrawerButtonSection(section: ExploreSection): boolean {
  return section.type === 'button' && !!section.action?.trim();
}

/** 发现抽屉：Legado type=text / password 输入框 */
export function isExploreDrawerTextSection(section: ExploreSection): boolean {
  return section.type === 'text' || section.type === 'password';
}

/** 写入书源变量对象（发现 select / show action 与登录切线共用） */
export function persistExploreSourceArgsObject(
  source: BookSource,
  mutate: (data: Record<string, unknown>) => void,
): void {
  const argsKey = getSourceArgsKey(source);
  const sourceKey = getLegadoSourceKey(source);
  let data: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(argsKey);
    if (raw) data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  mutate(data);
  normalizeServerFieldsInSourceArgs(data);
  const server = readServerUrlFromExploreArgs(data);
  if (server) {
    syncLegadoServerArgKeys(data, server);
    setExploreInfoMapValue(sourceKey, '线路', server);
  }
  persistSourceArgsJson(source, argsKey, JSON.stringify(data));
  clearExploreSectionsCache(sourceKey);
}

function readServerUrlFromExploreArgs(data: Record<string, unknown>): string | undefined {
  for (const key of ['线路', 'server'] as const) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) {
      return normalizeBookSourceServerUrl(v);
    }
  }
  return undefined;
}

/** 更新发现脚本用的书源变量（对齐 Legado setArguments / show） */
export function updateExploreSourceArgument(
  source: BookSource,
  paramKey: string,
  value: string
): void {
  persistExploreSourceArgsObject(source, (data) => {
    data[paramKey] = value;
    if (isLegadoServerArgKey(paramKey)) {
      syncLegadoServerArgKeys(data, value);
    }
    if (paramKey === 'find_tab') {
      data.tab = value;
      data.find_source = '番茄';
    }
    if (paramKey === 'find_source') {
      data.sources = value;
    }
  });
}

/**
 * 发现「线路」下拉：脚本 chars 仅含云端 hosts，须并入当前已选线路（含登录页手动 IP）。
 */
export function augmentExploreServerSelectSections(
  source: BookSource,
  sections: ExploreSection[],
): ExploreSection[] {
  const current = resolveBookSourceServerUrl(source);
  if (!current) return sections;

  return sections.map((section) => {
    if (!isExploreDrawerSelectSection(section)) return section;
    if (section.paramKey !== '线路' && section.paramKey !== 'server') return section;
    const chars = [...(section.chars ?? [])];
    const idx = chars.findIndex((c) => normalizeBookSourceServerUrl(c) === current);
    if (idx === 0) {
      return section.default === current ? section : { ...section, default: current };
    }
    if (idx > 0) {
      const reordered = [chars[idx]!, ...chars.filter((_, i) => i !== idx)];
      return { ...section, chars: reordered, default: current };
    }
    return { ...section, chars: [current, ...chars], default: current };
  });
}

/** 从书源变量 localStorage 读取发现脚本参数（对齐 Legado getArguments） */
export function readExploreSourceArgumentValue(
  source: BookSource,
  paramKey: string,
): string | undefined {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (!raw) return undefined;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const v = data[paramKey];
    if (v == null) return undefined;
    const s = String(v).trim();
    return s || undefined;
  } catch {
    return undefined;
  }
}

/** 发现抽屉 Select 当前展示值（优先已写入的书源变量，其次 infoMap / 脚本 default） */
export function getExploreSectionSelectDisplayValue(
  source: BookSource,
  section: ExploreSection,
): string {
  if (section.paramKey && isLegadoServerArgKey(section.paramKey)) {
    const server = resolveBookSourceServerUrl(source);
    if (server) return server;
  }
  if (section.paramKey) {
    const fromArgs = readExploreSourceArgumentValue(source, section.paramKey);
    if (fromArgs) return fromArgs;
  }
  const fromInfo = getExploreInfoMap(getLegadoSourceKey(source))[section.title]?.trim();
  if (fromInfo) return fromInfo;
  const def = section.default?.trim();
  if (def) return def;
  return section.chars?.[0] ?? '';
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

/** Legado exploreUrl 基础语法：换行或 && 分隔，每项为 title::url */
const EXPLORE_KIND_SEGMENT_SPLIT = /(?:&&|\r?\n)+/;

/**
 * 解析 Legado exploreUrl 的 name::url 列表（对齐 BookSourceExtensions.exploreKinds）
 * @see legado-own/app/src/main/java/io/legado/app/help/source/BookSourceExtensions.kt
 */
export function parseNameUrlExploreSections(text: string): ExploreSection[] | null {
  const trimmed = text.trim();
  if (
    !trimmed ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('<js>') ||
    trimmed.toLowerCase().startsWith('@js')
  ) {
    return null;
  }
  if (!trimmed.includes('::')) return null;

  const segments = trimmed
    .split(EXPLORE_KIND_SEGMENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  const sections: ExploreSection[] = [];
  for (const seg of segments) {
    const idx = seg.indexOf('::');
    if (idx < 0) {
      sections.push({ title: seg });
      continue;
    }
    const title = seg.slice(0, idx).trim();
    const url = seg.slice(idx + 2).trim();
    if (!title) continue;
    sections.push({ title, url: url || undefined });
  }
  return sections.length > 0 ? sections : null;
}

/**
 * 从书源解析发现子项列表（分类、排行榜等）- 同步，不执行脚本
 * - 若有 exploreScreen（legado 格式 JSON 数组，项含 title/url），解析后返回
 * - 若 exploreUrl 也是 JSON 数组格式（legado 标准做法），同样解析后返回
 * - 若无以上但有 exploreUrl + ruleExplore，返回单条「发现」
 * - 否则返回空数组
 */
export function getExploreSections(source: BookSource): ExploreSection[] {
  let result: ExploreSection[] = [];

  // 1. 优先从 exploreScreen 解析
  if (source.exploreScreen && typeof source.exploreScreen === 'string' && source.exploreScreen.trim()) {
    const sections = tryParseJsonSections(source.exploreScreen);
    if (sections) result = sections;
  }

  if (result.length === 0 && source.exploreUrl && typeof source.exploreUrl === 'string') {
    const trimmed = source.exploreUrl.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const sections = tryParseJsonSections(trimmed);
      if (sections) result = sections;
    } else {
      const nameUrlSections = parseNameUrlExploreSections(trimmed);
      if (nameUrlSections) result = nameUrlSections;
    }
  }

  if (result.length === 0 && source.exploreUrl && source.ruleExplore) {
    result = [{ title: '发现', url: source.exploreUrl }];
  }

  return result;
}

const exploreSectionsMemCache = new Map<string, ExploreSection[]>();

function exploreSectionsCacheKey(source: BookSource, argsVersion: number): string {
  return `${getLegadoSourceKey(source)}\0${argsVersion}`;
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
      const noticeBus = createScriptNoticeBus(source.sourceName, '发现');
      const sections = await runExploreScript(script, source, {
        onScriptToast: noticeBus.onScriptToast,
      });
      if (sections.length > 0) {
        const augmented = augmentExploreServerSelectSections(source, sections);
        exploreSectionsMemCache.set(cacheKey, augmented);
        return augmented;
      }
    } catch (e) {
      console.warn('[getExploreSectionsAsync] script run failed:', e);
    }
    return [{ title: '发现', url: source.exploreUrl }];
  }
  return getExploreSections(source);
}

/** 书源发现是否由脚本动态生成（exploreUrl 为 @js: / <js>... 形式，需异步执行脚本得到分类列表） */
export function isExploreUrlScript(exploreUrl: string | undefined): boolean {
  if (typeof exploreUrl !== 'string') return false;
  const s = exploreUrl.trimStart();
  return s.startsWith('<js>') || /^@js:/i.test(s);
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
