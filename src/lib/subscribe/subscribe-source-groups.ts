/**
 * 订阅源按 category 分组与拖拽 droppable id
 */

import type { SubSourceRow } from '@/lib/database/subscribe';
import type { Id } from '@thisbeyond/solid-dnd';

const CATEGORY_DROP_PREFIX = 'sub-cat:';

/**
 * 按 category 分组。
 * @param knownCategories 已注册的命名分类（可为空列表占位，不含「未分类」）
 */
export function groupSubscribeSourcesByCategory(
  sources: SubSourceRow[],
  knownCategories: Iterable<string> = [],
): Array<[string, SubSourceRow[]]> {
  const groups = new Map<string, SubSourceRow[]>();
  for (const source of sources) {
    const category = source.category?.trim() || '';
    const group = groups.get(category) ?? [];
    group.push(source);
    groups.set(category, group);
  }
  for (const raw of knownCategories) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title, 'zh-CN'),
    );
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, 'zh-CN');
  });
}

export function subscribeCategoryLabel(category: string): string {
  return category.trim() ? category : '未分类';
}

export function subscribeCategoryDroppableId(category: string): Id {
  return `${CATEGORY_DROP_PREFIX}${encodeURIComponent(category)}`;
}

export function parseSubscribeCategoryDroppableId(id: Id): string | null {
  const raw = String(id);
  if (!raw.startsWith(CATEGORY_DROP_PREFIX)) return null;
  try {
    return decodeURIComponent(raw.slice(CATEGORY_DROP_PREFIX.length));
  } catch {
    return raw.slice(CATEGORY_DROP_PREFIX.length);
  }
}

export function isSubscribeSourceId(id: Id, sourceIds: Set<string>): boolean {
  return sourceIds.has(String(id));
}

/** 展示顺序下的扁平 id 列表（与侧栏/管理页分组渲染一致） */
export function flattenSubscribeSourceIds(
  sources: SubSourceRow[],
): string[] {
  return groupSubscribeSourcesByCategory(sources).flatMap(([, group]) =>
    group.map((s) => s.id),
  );
}

/**
 * 扁平 Sortable 拖拽结束后，根据新顺序与落点推导 category + 组内次序。
 * - 拖到其他源上：被拖项继承目标源分类，整表按 sortedIds 重编号
 * - 拖到分类头：被拖项改入该分类并插到该分类末尾（保留其余项相对序）
 */
export function resolveSubscribeSourceLayoutAfterReorder(input: {
  sortedIds: string[];
  sources: SubSourceRow[];
  activeId: string;
  overId?: string | null;
}): Array<{ id: string; category: string }> | null {
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  if (!byId.has(input.activeId)) return null;

  const sortedIds = input.sortedIds.map(String).filter((id) => byId.has(id));
  if (sortedIds.length === 0) return null;

  const initialIds = flattenSubscribeSourceIds(input.sources).filter((id) =>
    byId.has(id),
  );
  const overId = input.overId != null ? String(input.overId) : null;
  const dropCat = overId ? parseSubscribeCategoryDroppableId(overId) : null;

  if (dropCat !== null) {
    const without = initialIds.filter((id) => id !== input.activeId);
    const layout: Array<{ id: string; category: string }> = without.map((id) => ({
      id,
      category: byId.get(id)!.category?.trim() || '',
    }));
    let insertAt = layout.length;
    let lastInCat = -1;
    for (let i = 0; i < layout.length; i++) {
      if (layout[i]!.category === dropCat) lastInCat = i;
    }
    if (lastInCat >= 0) insertAt = lastInCat + 1;
    layout.splice(insertAt, 0, { id: input.activeId, category: dropCat });
    return layout;
  }

  const orderChanged =
    sortedIds.length !== initialIds.length ||
    sortedIds.some((id, i) => id !== initialIds[i]);
  if (!orderChanged) return null;

  let activeCategory = byId.get(input.activeId)!.category?.trim() || '';
  if (overId && overId !== input.activeId && byId.has(overId)) {
    activeCategory = byId.get(overId)!.category?.trim() || '';
  } else {
    const idx = sortedIds.indexOf(input.activeId);
    if (idx >= 0) {
      const prev = idx > 0 ? byId.get(sortedIds[idx - 1]!) : null;
      const next =
        idx < sortedIds.length - 1 ? byId.get(sortedIds[idx + 1]!) : null;
      if (next) activeCategory = next.category?.trim() || '';
      else if (prev) activeCategory = prev.category?.trim() || '';
    }
  }

  return sortedIds.map((id) => ({
    id,
    category:
      id === input.activeId
        ? activeCategory
        : byId.get(id)!.category?.trim() || '',
  }));
}
