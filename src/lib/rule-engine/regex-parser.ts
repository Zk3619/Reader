import { mergeRegexRulePartsSync } from '@/lib/rule-engine/rule-analyzer';

/**
 * 正则表达式解析器
 * 对应 legado 项目的 AnalyzeByRegex.kt
 */

function runRegexStage(text: string, pattern: string): RegExpExecArray[] {
  const regex = new RegExp(pattern, 'g');
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }
  return matches;
}

function groupsFromMatch(m: RegExpExecArray): string[] {
  const out: string[] = [];
  for (let i = 0; i <= m.length; i += 1) {
    out.push(m[i] ?? '');
  }
  return out;
}

/**
 * Legado AnalyzeByRegex.getElements — 书籍/目录列表
 */
function getRegexElementsStages(stages: string[], text: string, stageIndex = 0): string[][] {
  if (stageIndex >= stages.length || !text) return [];
  const matches = runRegexStage(text, stages[stageIndex]);
  if (matches.length === 0) return [];

  if (stageIndex + 1 === stages.length) {
    const books: string[][] = [];
    for (const m of matches) {
      books.push(groupsFromMatch(m));
    }
    return books;
  }

  const merged = matches.map((m) => m[0] ?? '').join('');
  return getRegexElementsStages(stages, merged, stageIndex + 1);
}

function splitRegexStages(pattern: string): string[] {
  return pattern
    .split('&&')
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseRegexStages(pattern: string, text: string): string[] {
  try {
    const stages = splitRegexStages(pattern);
    if (stages.length === 0) return [];

    let currentText = text;
    let lastResults: string[] = [];

    for (let si = 0; si < stages.length; si += 1) {
      const matches = runRegexStage(currentText, stages[si]);
      if (matches.length === 0) return [];

      if (si < stages.length - 1) {
        currentText = matches.map((m) => m[0] ?? '').join('');
        continue;
      }

      lastResults = matches
        .map((m) => (m[1] !== undefined ? m[1] : m[0]))
        .filter((v): v is string => !!v && v.trim().length > 0);
    }

    return lastResults;
  } catch (error) {
    console.error('正则解析错误:', error, '规则:', pattern);
    return [];
  }
}

/** 解析正则规则（支持 Legado 顶层 || / %%；段内 && 串联） */
export function parseRegex(pattern: string, text: string): string[] {
  if (!pattern || !text) return [];
  return mergeRegexRulePartsSync(pattern, (part) => parseRegexStages(part, text));
}

/** :regex 列表 — 每条记录为捕获组数组 */
export function getRegexElements(pattern: string, text: string): string[][] {
  if (!pattern || !text) return [];
  return mergeRegexRulePartsSync(pattern, (part) =>
    getRegexElementsStages(splitRegexStages(part), text),
  );
}

/** 将捕获组列表转为书源列表项 content（默认用 group0，多组用 \\n 拼接） */
export function regexGroupsToElementContent(groups: string[]): string {
  if (groups.length === 0) return '';
  const primary = groups[1]?.trim() ? groups[1] : groups[0];
  if (groups.length <= 2) return primary ?? '';
  return groups.filter((g) => g != null && String(g).trim()).join('\n');
}
