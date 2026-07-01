/**
 * 文本选择菜单配置（对齐 Legado TextMenuConfig + TextActionMenu）
 */

import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import {
  TEXT_VIEWER_TEXT_MENU_COLLAPSED_PRIMARY_COUNT,
  TEXT_VIEWER_TEXT_MENU_ITEM_LABELS,
  TEXT_VIEWER_TEXT_MENU_ITEM_ORDER,
  type TextViewerTextMenuItemId,
} from '@/lib/media/text/reader-ui-config';

/** 第三方「以…处理文本」项（Web 端用 URL 模板模拟 Legado PROCESS_TEXT） */
export type TextViewerProcessTextApp = {
  key: string;
  label: string;
  /** `{text}` 占位符会被 encodeURIComponent 后的选中文本替换 */
  urlTemplate: string;
};

export const TEXT_VIEWER_PROCESS_TEXT_APPS: TextViewerProcessTextApp[] = [
  {
    key: 'edge-search',
    label: '在 Edge 中搜索',
    urlTemplate: 'https://www.bing.com/search?q={text}',
  },
  {
    key: 'google-search',
    label: '在 Google 中搜索',
    urlTemplate: 'https://www.google.com/search?q={text}',
  },
];

export type TextViewerTextMenuEntry =
  | { kind: 'builtin'; id: TextViewerTextMenuItemId }
  | { kind: 'processText'; key: string; label: string; urlTemplate: string };

export function normalizeTextMenuHiddenProcessTextItems(
  raw: string[] | undefined | null,
): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(TEXT_VIEWER_PROCESS_TEXT_APPS.map((app) => app.key));
  return raw.filter((key) => allowed.has(key));
}

/** 固定顺序 + 可选「从此处朗读」（contentSelectSpeakMod=1 且已启用） */
export function resolveTextMenuBuiltinOrder(
  config: Pick<TextViewerUiConfig, 'contentSelectSpeakMod' | 'textMenuVisibleItems'>,
): TextViewerTextMenuItemId[] {
  const visible = new Set(normalizeTextMenuVisibleItemSet(config.textMenuVisibleItems));
  const order: TextViewerTextMenuItemId[] = [];
  for (const id of TEXT_VIEWER_TEXT_MENU_ITEM_ORDER) {
    if (visible.has(id)) order.push(id);
  }
  if (
    (config.contentSelectSpeakMod ?? 0) === 1 &&
    visible.has('speakFromHere') &&
    !order.includes('speakFromHere')
  ) {
    const speakIdx = order.indexOf('speakSelection');
    if (speakIdx >= 0) {
      order.splice(speakIdx + 1, 0, 'speakFromHere');
    } else {
      order.push('speakFromHere');
    }
  }
  return order;
}

export function normalizeTextMenuVisibleItemSet(
  raw: string[] | undefined | null,
): Set<TextViewerTextMenuItemId> {
  const allowed = new Set<string>([
    ...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER,
    'speakFromHere',
  ]);
  if (!Array.isArray(raw) || raw.length === 0) {
    return new Set([...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER]);
  }
  const next = raw.filter((id): id is TextViewerTextMenuItemId => allowed.has(id));
  if (next.length === 0) return new Set([...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER]);
  return new Set(next);
}

export function resolveVisibleProcessTextApps(
  hiddenKeys: string[] | undefined | null,
): TextViewerProcessTextApp[] {
  const hidden = new Set(normalizeTextMenuHiddenProcessTextItems(hiddenKeys));
  return TEXT_VIEWER_PROCESS_TEXT_APPS.filter((app) => !hidden.has(app.key));
}

/** 展开模式 / 折叠模式下的完整可见条目（内置 + 第三方） */
export function resolveTextMenuEntries(
  config: Pick<
    TextViewerUiConfig,
    'contentSelectSpeakMod' | 'textMenuVisibleItems' | 'textMenuHiddenProcessTextItems'
  >,
): TextViewerTextMenuEntry[] {
  const builtins = resolveTextMenuBuiltinOrder(config);
  const entries: TextViewerTextMenuEntry[] = builtins.map((id) => ({
    kind: 'builtin',
    id,
  }));
  for (const app of resolveVisibleProcessTextApps(config.textMenuHiddenProcessTextItems)) {
    entries.push({
      kind: 'processText',
      key: app.key,
      label: app.label,
      urlTemplate: app.urlTemplate,
    });
  }
  return entries;
}

export function splitTextMenuEntriesForCollapsed(
  entries: TextViewerTextMenuEntry[],
): { primary: TextViewerTextMenuEntry[]; more: TextViewerTextMenuEntry[] } {
  if (entries.length <= TEXT_VIEWER_TEXT_MENU_COLLAPSED_PRIMARY_COUNT) {
    return { primary: entries, more: [] };
  }
  return {
    primary: entries.slice(0, TEXT_VIEWER_TEXT_MENU_COLLAPSED_PRIMARY_COUNT),
    more: entries.slice(TEXT_VIEWER_TEXT_MENU_COLLAPSED_PRIMARY_COUNT),
  };
}

export function labelForTextMenuEntry(entry: TextViewerTextMenuEntry): string {
  if (entry.kind === 'builtin') return TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[entry.id];
  return entry.label;
}

export function defaultTextMenuVisibleItemIds(): TextViewerTextMenuItemId[] {
  return [...TEXT_VIEWER_TEXT_MENU_ITEM_ORDER];
}
