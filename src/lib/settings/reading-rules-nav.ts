/** 阅读体验 Tab 内三种规则管理子页 */
export type ReadingRulePageId = 'txt-toc' | 'replace' | 'dict';

export interface ReadingRuleNavEntry {
  id: ReadingRulePageId;
  title: string;
  description: string;
}

export const READING_RULE_NAV_ENTRIES: ReadingRuleNavEntry[] = [
  {
    id: 'txt-toc',
    title: 'TXT 目录规则',
    description: '本地 TXT 分章与目录识别',
  },
  {
    id: 'replace',
    title: '替换净化',
    description: '正文与标题替换规则',
  },
  {
    id: 'dict',
    title: '字典规则',
    description: '阅读选词查词典',
  },
];

export function getReadingRuleNavEntry(id: ReadingRulePageId): ReadingRuleNavEntry {
  return READING_RULE_NAV_ENTRIES.find((e) => e.id === id)!;
}
