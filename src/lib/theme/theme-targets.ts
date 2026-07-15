/**
 * 主题目标与继承链。
 *
 * 目标只描述“主题应用到哪里”，主题包内容与活动预设存储由上层模块负责。
 * 精确目标没有活动主题时，依次回退到所属模块和应用壳层。
 */

export const THEME_TARGET_IDS = [
  'app',
  'module.reading',
  'viewer.text',
  'viewer.image',
  'viewer.audio',
  'viewer.video',
  'viewer.file',
  'module.music',
  'music.playDetail',
  'music.desktopLyric',
] as const;

export type ThemeTargetId = (typeof THEME_TARGET_IDS)[number];
export type ActiveThemePresetByTarget = Partial<Record<ThemeTargetId, string>>;

export interface ThemeTargetDefinition {
  id: ThemeTargetId;
  label: string;
  description: string;
  parent: ThemeTargetId | null;
}

export const THEME_TARGETS: readonly ThemeTargetDefinition[] = [
  {
    id: 'app',
    label: '应用壳层',
    description: '全局导航、页面和通用控件',
    parent: null,
  },
  {
    id: 'module.reading',
    label: '阅读模块',
    description: '各阅读器共享的工具栏与内容外壳',
    parent: 'app',
  },
  {
    id: 'viewer.text',
    label: '文本阅读器',
    description: 'TXT、EPUB 等文本阅读内容',
    parent: 'module.reading',
  },
  {
    id: 'viewer.image',
    label: '图片阅读器',
    description: '图片舞台与图片阅读控件',
    parent: 'module.reading',
  },
  {
    id: 'viewer.audio',
    label: '音频阅读器',
    description: '独立音频查看器',
    parent: 'module.reading',
  },
  {
    id: 'viewer.video',
    label: '视频阅读器',
    description: '视频舞台与控制栏',
    parent: 'module.reading',
  },
  {
    id: 'viewer.file',
    label: '文件阅读器',
    description: '通用文件预览',
    parent: 'module.reading',
  },
  {
    id: 'module.music',
    label: '音乐模块',
    description: '音乐搜索、歌单、榜单和播放栏',
    parent: 'app',
  },
  {
    id: 'music.playDetail',
    label: '音乐播放详情',
    description: '封面、歌词和播放详情控件',
    parent: 'module.music',
  },
  {
    id: 'music.desktopLyric',
    label: '桌面歌词',
    description: '独立桌面歌词窗口',
    parent: 'module.music',
  },
] as const;

const targetDefinitionMap = new Map(THEME_TARGETS.map((target) => [target.id, target]));
const targetIdSet = new Set<string>(THEME_TARGET_IDS);

export function isThemeTargetId(value: unknown): value is ThemeTargetId {
  return typeof value === 'string' && targetIdSet.has(value);
}

export function getThemeTargetDefinition(target: ThemeTargetId): ThemeTargetDefinition {
  return targetDefinitionMap.get(target)!;
}

export function getThemeTargetChain(target: ThemeTargetId): ThemeTargetId[] {
  const chain: ThemeTargetId[] = [];
  let current: ThemeTargetId | null = target;
  while (current) {
    chain.push(current);
    current = getThemeTargetDefinition(current).parent;
  }
  return chain;
}

export function normalizeActiveThemePresetByTarget(
  value: unknown,
  legacy?: {
    activeThemePresetId?: string;
    activeViewerThemePresetId?: string;
  },
): ActiveThemePresetByTarget {
  const result: ActiveThemePresetByTarget = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, presetId] of Object.entries(value as Record<string, unknown>)) {
      if (isThemeTargetId(key) && typeof presetId === 'string' && presetId.trim()) {
        result[key] = presetId.trim();
      }
    }
  }
  if (!result.app && legacy?.activeThemePresetId?.trim()) {
    result.app = legacy.activeThemePresetId.trim();
  }
  if (!result['module.reading'] && legacy?.activeViewerThemePresetId?.trim()) {
    result['module.reading'] = legacy.activeViewerThemePresetId.trim();
  }
  return result;
}

export function resolveActiveThemePresetId(
  target: ThemeTargetId,
  activeByTarget: ActiveThemePresetByTarget,
): { target: ThemeTargetId; presetId: string } | null {
  for (const candidate of getThemeTargetChain(target)) {
    const presetId = activeByTarget[candidate]?.trim();
    if (presetId) return { target: candidate, presetId };
  }
  return null;
}

export function isThemePresetActive(
  presetId: string,
  activeByTarget: ActiveThemePresetByTarget,
): boolean {
  return Object.values(activeByTarget).some((activeId) => activeId === presetId);
}

interface ThemePackTargetApplicability {
  scopes?: { app?: boolean; viewer?: boolean };
  app?: unknown;
  viewer?: unknown;
  targets?: Partial<Record<ThemeTargetId, unknown>>;
}

/** 判断主题包是否真实包含指定层级可应用的内容。 */
export function isThemePackApplicableToTarget(
  pack: ThemePackTargetApplicability,
  target: ThemeTargetId,
): boolean {
  if (pack.targets?.[target] != null) return true;
  if (target === 'app') return pack.scopes?.app !== false && pack.app != null;
  if (target === 'module.reading') {
    return pack.scopes?.viewer !== false && pack.viewer != null;
  }
  return false;
}

export function isThemePresetActiveForTarget(
  presetId: string,
  target: ThemeTargetId,
  activeByTarget: ActiveThemePresetByTarget,
): boolean {
  return activeByTarget[target] === presetId;
}

/**
 * 删除活动预设时清理所有目标：两个兼容根目标回到内置主题，
 * 细分目标移除显式选择后自然沿继承链回退。
 */
export function replaceDeletedThemePresetTargets(
  activeByTarget: ActiveThemePresetByTarget,
  deletedPresetId: string,
  rootFallbackPresetId: string,
): ActiveThemePresetByTarget {
  const next = { ...activeByTarget };
  for (const target of THEME_TARGET_IDS) {
    if (next[target] !== deletedPresetId) continue;
    if (target === 'app' || target === 'module.reading') {
      next[target] = rootFallbackPresetId;
    } else {
      delete next[target];
    }
  }
  return next;
}
