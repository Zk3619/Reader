/**
 * 发现页分类导航项：仅展示可进入书籍列表的按钮，以及 select/嵌套 select 筛选
 */

import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { shouldOpenExplorePageForSection } from '@/lib/book-source/explore-section-action';

export function exploreSectionFlexClass(section: ExploreSection): string {
  const basisPct = section.style?.layout_flexBasisPercent ?? 1;
  if (basisPct <= 0.25) return 'min-w-0 flex-[1_1_25%]';
  if (basisPct <= 0.45) return 'min-w-0 flex-[1_1_45%]';
  return 'min-w-0 flex-[1_1_100%]';
}

export type ExploreSectionNavItem =
  | { kind: 'button'; section: ExploreSection; flexClass: string }
  | {
      kind: 'select';
      label: string;
      flexClass: string;
      /** 下拉选项（含 url）；父级可点击时首项为父级 */
      options: ExploreSection[];
      /** Legado paramKey 筛选（变更后需重载分类） */
      filterSection?: ExploreSection;
    };

/** Legado createFilter：type=select + paramKey（晴天聚合：线路/模式/频道/平台等） */
export function isExploreSourceArgumentSelect(section: ExploreSection): boolean {
  return (
    section.type === 'select' &&
    !!section.chars &&
    section.chars.length > 0 &&
    !!section.paramKey
  );
}

function isLegadoSelectFilter(section: ExploreSection): boolean {
  return isExploreSourceArgumentSelect(section);
}

function buildSelectOptions(section: ExploreSection): ExploreSection[] {
  if (section.children && section.children.length > 0) {
    const parentUrl = section.url?.trim();
    const parentOpenable =
      !!parentUrl && shouldOpenExplorePageForSection({ ...section, url: parentUrl });
    const opts = [...section.children];
    if (parentOpenable) {
      return [{ title: section.title, url: parentUrl }, ...opts];
    }
    return opts;
  }
  if (isLegadoSelectFilter(section)) {
    return section.chars!.map((title) => ({
      title,
      url: section.url,
      paramKey: section.paramKey,
      type: section.type,
      chars: section.chars,
      default: section.default,
    }));
  }
  return [];
}

/** 是否应在发现页固定区展示 */
export function shouldShowInExploreNav(section: ExploreSection): boolean {
  if (isLegadoSelectFilter(section)) return true;
  if (section.children && section.children.length > 0) return true;
  return shouldOpenExplorePageForSection(section);
}

/** 书源变量类下拉的当前值（优先脚本回填的 default） */
export function getExploreArgumentSelectValue(
  item: Extract<ExploreSectionNavItem, { kind: 'select' }>,
  selectedSection?: ExploreSection | null,
): string {
  const filter = item.filterSection;
  if (filter?.paramKey) {
    const def = filter.default?.trim();
    if (def) return def;
    const first = filter.chars?.[0]?.trim();
    if (first) return first;
  }
  const sel = selectedSection;
  if (!sel) return item.options[0]?.title ?? '';
  const hit = item.options.find(
    (o) => o.title === sel.title && (o.url ?? '') === (sel.url ?? ''),
  );
  return hit?.title ?? item.options[0]?.title ?? '';
}

/** 下拉项展示文案（线路存 URL，展示 hostname） */
export function formatExploreSelectOptionLabel(title: string, paramKey?: string): string {
  if (paramKey === 'server') {
    try {
      const host = new URL(title).hostname;
      return host || title;
    } catch {
      return title.replace(/^https?:\/\//i, '').split('/')[0] || title;
    }
  }
  return title;
}

function pickFirstExploreHubListSection(
  sections: ExploreSection[],
  skipArgumentSelect: boolean,
): ExploreSection | null {
  for (const section of sections) {
    if (section.children && section.children.length > 0) {
      const parentUrl = section.url?.trim();
      if (
        parentUrl &&
        shouldOpenExplorePageForSection({ ...section, url: parentUrl }) &&
        (!skipArgumentSelect || !isExploreSourceArgumentSelect(section))
      ) {
        return { ...section, url: parentUrl };
      }
      for (const child of section.children) {
        if (!shouldOpenExplorePageForSection(child)) continue;
        if (skipArgumentSelect && isExploreSourceArgumentSelect(child)) continue;
        return child;
      }
      continue;
    }
    if (!shouldOpenExplorePageForSection(section)) continue;
    if (skipArgumentSelect && isExploreSourceArgumentSelect(section)) continue;
    return section;
  }
  return null;
}

/**
 * 探索 hub 默认书籍列表分类：优先第一个非 type=select 筛选（paramKey），
 * 若无则回退到第一个可进入列表页的项。
 */
export function pickDefaultExploreHubSection(sections: ExploreSection[]): ExploreSection | null {
  return (
    pickFirstExploreHubListSection(sections, true) ??
    pickFirstExploreHubListSection(sections, false)
  );
}

export function buildExploreSectionNavItems(sections: ExploreSection[]): ExploreSectionNavItem[] {
  const items: ExploreSectionNavItem[] = [];
  for (const section of sections) {
    if (!shouldShowInExploreNav(section)) continue;
    const flexClass = exploreSectionFlexClass(section);

    if (isLegadoSelectFilter(section) || (section.children && section.children.length > 0)) {
      const options = buildSelectOptions(section);
      if (options.length === 0) continue;
      items.push({
        kind: 'select',
        label: section.title,
        flexClass,
        options,
        filterSection: isLegadoSelectFilter(section) ? section : undefined,
      });
      continue;
    }

    if (shouldOpenExplorePageForSection(section)) {
      items.push({ kind: 'button', section, flexClass });
    }
  }
  return items;
}
