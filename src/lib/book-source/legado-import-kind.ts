/**
 * Legado 各类 JSON 导入的类型识别（对齐 Legado 书源 / 订阅 / 规则字段差异）
 */

export type LegadoImportItemKind =
  | 'bookSource'
  | 'rssSource'
  | 'replaceRule'
  | 'dictRule'
  | 'txtTocRule'
  | 'sourceUrlsEnvelope'
  | 'unknown';

export const LEGADO_IMPORT_KIND_LABEL: Record<LegadoImportItemKind, string> = {
  bookSource: '书源',
  rssSource: '订阅源',
  replaceRule: '替换规则',
  dictRule: '字典规则',
  txtTocRule: 'TXT 目录规则',
  sourceUrlsEnvelope: '书源链接列表',
  unknown: '未知',
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasObjectOrStringField(obj: Record<string, unknown>, key: string): boolean {
  const value = obj[key];
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'object';
}

function hasSourceIdentity(obj: Record<string, unknown>): boolean {
  return (
    (nonEmptyString(obj.sourceUrl) ||
      nonEmptyString(obj.bookSourceUrl) ||
      nonEmptyString(obj.rssSourceUrl)) &&
    (nonEmptyString(obj.sourceName) ||
      nonEmptyString(obj.bookSourceName) ||
      nonEmptyString(obj.rssSourceName))
  );
}

function hasReplaceRuleMarkers(obj: Record<string, unknown>): boolean {
  return nonEmptyString(obj.pattern) || nonEmptyString(obj.regex);
}

function hasDictRuleMarkers(obj: Record<string, unknown>): boolean {
  return nonEmptyString(obj.urlRule) || nonEmptyString(obj.showRule);
}

function hasTxtTocRuleMarkers(obj: Record<string, unknown>): boolean {
  return (
    nonEmptyString(obj.rule) &&
    nonEmptyString(obj.name) &&
    !hasReplaceRuleMarkers(obj) &&
    (obj.example !== undefined ||
      obj.serialNumber !== undefined ||
      obj.enable !== undefined ||
      obj.replacement !== undefined)
  );
}

/** 订阅源特征字段（与书源 ruleSearch / ruleToc 等区分） */
export function hasRssSourceMarkers(obj: Record<string, unknown>): boolean {
  if (nonEmptyString(obj.rssSourceUrl) || nonEmptyString(obj.rssSourceName)) return true;
  if (nonEmptyString(obj.ruleArticles)) return true;
  if (nonEmptyString(obj.sortUrl)) return true;
  if (obj.singleUrl === true) return true;
  if (
    ['ruleTitle', 'rulePubDate', 'ruleDescription', 'ruleImage', 'ruleLink'].some((key) =>
      nonEmptyString(obj[key]),
    )
  ) {
    return true;
  }
  if (
    typeof obj.articleStyle === 'number' &&
    (nonEmptyString(obj.sourceUrl) || nonEmptyString(obj.rssSourceUrl))
  ) {
    return true;
  }
  if (nonEmptyString(obj.contentWhitelist) || nonEmptyString(obj.contentBlacklist)) return true;
  return false;
}

/** 书源特征字段（与订阅源 ruleArticles / sortUrl 等区分） */
export function hasBookSourceMarkers(obj: Record<string, unknown>): boolean {
  if (nonEmptyString(obj.bookSourceUrl) || nonEmptyString(obj.bookSourceName)) return true;
  if (nonEmptyString(obj.searchUrl) || nonEmptyString(obj.exploreUrl)) return true;
  if (nonEmptyString(obj.bookUrlPattern)) return true;
  if (typeof obj.bookSourceType === 'number') return true;
  return ['ruleSearch', 'ruleExplore', 'ruleBookInfo', 'ruleToc', 'ruleContent', 'ruleReview'].some(
    (key) => hasObjectOrStringField(obj, key),
  );
}

export function classifyLegadoImportItem(raw: Record<string, unknown>): LegadoImportItemKind {
  if (Array.isArray(raw.sourceUrls)) {
    return 'sourceUrlsEnvelope';
  }

  if (hasReplaceRuleMarkers(raw) && !hasSourceIdentity(raw)) {
    return 'replaceRule';
  }

  if (hasDictRuleMarkers(raw) && !hasSourceIdentity(raw) && !hasReplaceRuleMarkers(raw)) {
    return 'dictRule';
  }

  if (hasTxtTocRuleMarkers(raw) && !hasSourceIdentity(raw)) {
    return 'txtTocRule';
  }

  const rss = hasRssSourceMarkers(raw);
  const book = hasBookSourceMarkers(raw);

  if (rss && !book) return 'rssSource';
  if (book && !rss) return 'bookSource';

  if (rss && book) {
    if (nonEmptyString(raw.ruleArticles)) return 'rssSource';
    if (
      hasObjectOrStringField(raw, 'ruleSearch') ||
      hasObjectOrStringField(raw, 'ruleToc') ||
      hasObjectOrStringField(raw, 'ruleContent') ||
      nonEmptyString(raw.searchUrl) ||
      nonEmptyString(raw.exploreUrl)
    ) {
      return 'bookSource';
    }
    return 'rssSource';
  }

  if (hasSourceIdentity(raw)) return 'unknown';
  if (hasReplaceRuleMarkers(raw)) return 'replaceRule';
  return 'unknown';
}

export function matchesLegadoImportKind(
  raw: Record<string, unknown>,
  expected: LegadoImportItemKind,
): boolean {
  const actual = classifyLegadoImportItem(raw);
  if (actual === expected) return true;
  if (actual !== 'unknown') return false;

  switch (expected) {
    case 'bookSource':
    case 'rssSource':
      return hasSourceIdentity(raw);
    case 'replaceRule':
      return hasReplaceRuleMarkers(raw);
    case 'dictRule':
      return hasDictRuleMarkers(raw);
    case 'txtTocRule':
      return hasTxtTocRuleMarkers(raw);
    default:
      return false;
  }
}

export function parseLegadoImportJsonItems(jsonText: string): Record<string, unknown>[] {
  const trimmed = jsonText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (Array.isArray(data)) {
    return data.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object',
    );
  }
  if (data && typeof data === 'object') {
    return [data as Record<string, unknown>];
  }
  return [];
}

export function summarizeLegadoImportKinds(
  items: Record<string, unknown>[],
): Partial<Record<LegadoImportItemKind, number>> {
  const counts: Partial<Record<LegadoImportItemKind, number>> = {};
  for (const item of items) {
    const kind = classifyLegadoImportItem(item);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function dominantLegadoImportKind(
  counts: Partial<Record<LegadoImportItemKind, number>>,
): LegadoImportItemKind | 'mixed' | 'unknown' {
  const entries = Object.entries(counts).filter(
    ([kind, count]) => kind !== 'unknown' && kind !== 'sourceUrlsEnvelope' && (count ?? 0) > 0,
  ) as Array<[LegadoImportItemKind, number]>;
  if (entries.length === 0) return 'unknown';
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > 1 && entries[0]![1] === entries[1]![1]) return 'mixed';
  return entries[0]![0];
}

export function classifyLegadoImportJson(jsonText: string): {
  items: Record<string, unknown>[];
  counts: Partial<Record<LegadoImportItemKind, number>>;
  dominant: LegadoImportItemKind | 'mixed' | 'unknown';
} {
  const items = parseLegadoImportJsonItems(jsonText);
  const counts = summarizeLegadoImportKinds(items);
  return {
    items,
    counts,
    dominant: dominantLegadoImportKind(counts),
  };
}

export function wrongLegadoImportKindMessage(
  expected: LegadoImportItemKind,
  actual: LegadoImportItemKind | 'mixed' | 'unknown',
): string {
  const expectedLabel = LEGADO_IMPORT_KIND_LABEL[expected];
  if (actual === 'mixed') {
    return `文件包含多种类型数据，无法在「${expectedLabel}」导入中使用`;
  }
  if (actual === 'unknown') {
    return `未能识别为有效的${expectedLabel} JSON`;
  }
  return `检测到${LEGADO_IMPORT_KIND_LABEL[actual]}数据，请使用对应的${LEGADO_IMPORT_KIND_LABEL[actual]}导入入口`;
}
