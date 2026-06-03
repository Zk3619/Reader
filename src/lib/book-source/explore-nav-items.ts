/**
 * 发现页分类导航项：仅展示可进入书籍列表的按钮，以及 select/嵌套 select 筛选
 */

import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { isExploreDrawerSelectSection } from '@/lib/book-source/explore-sections';
import { shouldOpenExplorePageForSection } from '@/lib/book-source/explore-section-action';
import { EXPLORE_KIND_DEFAULT_BASIS_PERCENT } from '@/lib/book-source/legado-flex-child-style';

/** Tailwind 近似类（发现抽屉请用 legadoFlexChildWrapperStyle 精确对齐脚本 style） */
export function exploreSectionFlexClass(section: ExploreSection): string {
  const raw = section.style?.layout_flexBasisPercent;
  const basisPct =
    typeof raw === 'number' && raw >= 0 ? (raw <= 1 ? raw : raw / 100) : EXPLORE_KIND_DEFAULT_BASIS_PERCENT;
  if (basisPct <= 1 / 3 + 0.02) return 'min-w-0 flex-[0_0_33.333%]';
  if (basisPct <= 2 / 3 + 0.02) return 'min-w-0 flex-[0_0_66.666%]';
  return 'min-w-0 flex-[0_0_100%]';
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
  return isExploreDrawerSelectSection(section) && !!section.paramKey;
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

function sectionsMatch(a: ExploreSection, b: ExploreSection): boolean {
  return a.title === b.title && (a.url ?? '') === (b.url ?? '');
}

/** 当前选中分类是否仍属于该书源的导航项（含下拉子项） */
export function isExploreSectionInNav(
  sections: ExploreSection[],
  selected: ExploreSection | null | undefined,
): boolean {
  if (!selected) return false;
  const items = buildExploreSectionNavItems(sections);
  for (const item of items) {
    if (item.kind === 'button' && sectionsMatch(item.section, selected)) return true;
    if (item.kind === 'select' && item.options.some((o) => sectionsMatch(o, selected))) return true;
  }
  for (const section of sections) {
    if (sectionsMatch(section, selected)) return true;
    if (section.children?.some((c) => sectionsMatch(c, selected))) return true;
  }
  return false;
}

export type ExploreNavAutoSelection = {
  section: ExploreSection | null;
  /** 需先写入书源变量再重载分类 */
  argumentUpdate?: { paramKey: string; value: string };
};

/**
 * 探索 hub 默认选中：导航区第一个可选项（按钮或下拉首项）。
 * 若首项为书源变量筛选且当前值未对齐，返回 argumentUpdate。
 */
export function resolveDefaultExploreNavSelection(
  sections: ExploreSection[],
  selectedSection?: ExploreSection | null,
): ExploreNavAutoSelection {
  const items = buildExploreSectionNavItems(sections);
  if (items.length === 0) {
    return { section: pickDefaultExploreHubSection(sections) };
  }

  const first = items[0]!;
  if (first.kind === 'button') {
    return { section: first.section };
  }

  const opt = first.options[0];
  if (!opt) {
    return { section: pickDefaultExploreHubSection(sections) };
  }

  if (first.filterSection?.paramKey) {
    const current = getExploreArgumentSelectValue(first, selectedSection);
    if (current !== opt.title) {
      return {
        section: shouldOpenExplorePageForSection(opt) ? opt : pickDefaultExploreHubSection(sections),
        argumentUpdate: { paramKey: first.filterSection.paramKey, value: opt.title },
      };
    }
    if (shouldOpenExplorePageForSection(opt)) {
      return { section: opt };
    }
    return { section: pickDefaultExploreHubSection(sections) };
  }

  if (shouldOpenExplorePageForSection(opt)) {
    return { section: opt };
  }

  return { section: pickDefaultExploreHubSection(sections) };
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
