/**
 * 标题识别词（MoviePilot / misaka 轻量子集）
 * 规则存 prefs.recognitionRules 纯文本，不入库。
 *
 * 支持：
 * - BLOCK:屏蔽词
 * - 被替换词 => 替换词
 * - 前定位词 <> 后定位词 >> 集偏移
 * - 被替换词 => 替换词 && 前定位词 <> 后定位词 >> 集偏移
 * - 标题 => {[season_offset=1>2]} 或 {[season_offset=1>2;title=新名]}
 */

export type RecognitionRule =
  | { type: 'block'; word: string }
  | { type: 'replace'; source: string; target: string }
  | {
      type: 'offset';
      beforeLocator: string;
      afterLocator: string;
      offset: string;
    }
  | {
      type: 'complex';
      source: string;
      target: string;
      beforeLocator: string;
      afterLocator: string;
      offset: string;
    }
  | {
      type: 'season_offset';
      source: string;
      seasonOffset: string;
      title?: string;
      sourceRestriction?: string;
    };

export type RecognitionApplyResult = {
  text: string;
  episode: number | null;
  season: number | null;
  changed: boolean;
};

function exactMatch(text: string, pattern: string): boolean {
  if (text === pattern) return true;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|[\\s\\-_\\[\\]()（）【】])${escaped}(?:$|[\\s\\-_\\[\\]()（）【】])`,
  );
  return re.test(text);
}

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const m of text.matchAll(/\d+/g)) {
    numbers.push(Number(m[0]));
  }
  const cn: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    零: 0,
  };
  for (const ch of text) {
    if (ch in cn) numbers.push(cn[ch]!);
  }
  return numbers;
}

function applyEpisodeOffsetExpr(
  ep: number,
  offset: string,
): number {
  const expr = offset.trim();
  try {
    if (/^EP/i.test(expr)) {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${expr.replace(/EP/gi, String(ep))});`)();
      return Math.max(1, Math.floor(Number(v)));
    }
    if (expr.startsWith('+')) return Math.max(1, ep + Number(expr.slice(1)));
    if (expr.startsWith('-')) return Math.max(1, ep - Number(expr.slice(1)));
    return Math.max(1, ep + Number(expr));
  } catch {
    return ep;
  }
}

function applyOffsetWithLocators(
  text: string,
  episode: number | null,
  before: string,
  after: string,
  offset: string,
): number | null {
  const escapedBefore = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAfter = after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedBefore}(.*?)${escapedAfter}`);
  const m = text.match(re);
  if (!m) return episode;
  const nums = extractNumbers(m[1] ?? '');
  if (!nums.length) return episode;
  return applyEpisodeOffsetExpr(nums[0]!, offset);
}

function applySeasonOffset(
  season: number | null,
  offsetRule: string,
): number | null {
  if (!offsetRule || season == null) return season;
  try {
    if (offsetRule.includes('>')) {
      const [src, target] = offsetRule.split('>', 2).map((s) => s.trim());
      if (src === '*' || Number(src) === season) {
        return Math.max(1, Number(target));
      }
      return season;
    }
    if (offsetRule.startsWith('*')) {
      const expr = offsetRule.slice(1);
      if (expr.startsWith('+')) return Math.max(1, season + Number(expr.slice(1)));
      if (expr.startsWith('-')) return Math.max(1, season - Number(expr.slice(1)));
      return season;
    }
    for (const op of ['+', '-'] as const) {
      if (!offsetRule.includes(op)) continue;
      const idx = offsetRule.indexOf(op);
      const sourceSeason = Number(offsetRule.slice(0, idx).trim());
      if (sourceSeason !== season) return season;
      const delta = Number(offsetRule.slice(idx + 1).trim());
      return Math.max(1, op === '+' ? season + delta : season - delta);
    }
  } catch {
    /* */
  }
  return season;
}

function parseMetadataTarget(target: string): {
  seasonOffset?: string;
  title?: string;
  source?: string;
} | null {
  if (!target.startsWith('{[') || !target.endsWith(']}')) return null;
  const content = target.slice(2, -2);
  const meta: { seasonOffset?: string; title?: string; source?: string } = {};
  for (const part of content.split(';')) {
    if (!part.includes('=')) continue;
    const eq = part.indexOf('=');
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'season_offset') meta.seasonOffset = value;
    else if (key === 'title') meta.title = value;
    else if (key === 'source') meta.source = value;
  }
  return Object.keys(meta).length ? meta : null;
}

export function parseRecognitionRules(content: string): {
  rules: RecognitionRule[];
  warnings: string[];
} {
  const rules: RecognitionRule[] = [];
  const warnings: string[] = [];
  if (!content?.trim()) return { rules, warnings };

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;
    try {
      const rule = parseSingleRule(line);
      if (rule) rules.push(rule);
      else warnings.push(`第${i + 1}行格式不明确，跳过: ${line}`);
    } catch (e) {
      warnings.push(
        `第${i + 1}行解析失败: ${line} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }
  return { rules, warnings };
}

function parseSingleRule(line: string): RecognitionRule | null {
  if (line.startsWith('BLOCK:')) {
    const word = line.slice(6).trim();
    return word ? { type: 'block', word } : null;
  }

  const hasReplace = line.includes(' => ');
  const hasOffset = line.includes(' <> ') && line.includes(' >> ');
  const hasComplex = hasReplace && line.includes(' && ');

  if (hasComplex) {
    const [replacePart, offsetPart] = line.split(' && ', 2);
    const replaceRule = parseSingleRule(replacePart!.trim());
    const offsetRule = parseSingleRule(offsetPart!.trim());
    if (
      replaceRule?.type === 'replace' &&
      offsetRule?.type === 'offset'
    ) {
      return {
        type: 'complex',
        source: replaceRule.source,
        target: replaceRule.target,
        beforeLocator: offsetRule.beforeLocator,
        afterLocator: offsetRule.afterLocator,
        offset: offsetRule.offset,
      };
    }
    return null;
  }

  if (hasReplace) {
    const [source, target] = line.split(' => ', 2).map((s) => s.trim());
    if (!source || !target) return null;
    const meta = parseMetadataTarget(target);
    if (meta?.seasonOffset) {
      return {
        type: 'season_offset',
        source,
        seasonOffset: meta.seasonOffset,
        title: meta.title,
        sourceRestriction: meta.source,
      };
    }
    return { type: 'replace', source, target };
  }

  if (hasOffset) {
    const [locatorPart, offset] = line.split(' >> ', 2).map((s) => s.trim());
    if (!locatorPart?.includes(' <> ') || !offset) return null;
    const [beforeLocator, afterLocator] = locatorPart
      .split(' <> ', 2)
      .map((s) => s.trim());
    if (!beforeLocator || afterLocator == null) return null;
    return {
      type: 'offset',
      beforeLocator,
      afterLocator,
      offset,
    };
  }

  return null;
}

/** 搜索预处理：在清洗/映射前应用 */
export function applySearchPreprocessing(
  text: string,
  episode: number | null = null,
  season: number | null = null,
  rulesContent = '',
): RecognitionApplyResult {
  const { rules } = parseRecognitionRules(rulesContent);
  let processedText = text;
  let processedEpisode = episode;
  let processedSeason = season;
  let changed = false;

  for (const rule of rules) {
    if (rule.type === 'block') {
      if (processedText.includes(rule.word)) {
        processedText = processedText.split(rule.word).join('').trim();
        changed = true;
      }
    } else if (rule.type === 'replace') {
      if (exactMatch(processedText, rule.source)) {
        processedText = processedText.split(rule.source).join(rule.target);
        changed = true;
      }
    } else if (rule.type === 'offset') {
      const next = applyOffsetWithLocators(
        processedText,
        processedEpisode,
        rule.beforeLocator,
        rule.afterLocator,
        rule.offset,
      );
      if (next !== processedEpisode) {
        processedEpisode = next;
        changed = true;
      }
    } else if (rule.type === 'complex') {
      if (processedText.includes(rule.source)) {
        processedText = processedText.split(rule.source).join(rule.target);
        const next = applyOffsetWithLocators(
          processedText,
          processedEpisode,
          rule.beforeLocator,
          rule.afterLocator,
          rule.offset,
        );
        if (next !== processedEpisode) processedEpisode = next;
        changed = true;
      }
    } else if (rule.type === 'season_offset') {
      if (exactMatch(processedText, rule.source)) {
        if (rule.title) {
          processedText = rule.title;
          changed = true;
        }
        const next = applySeasonOffset(processedSeason ?? 1, rule.seasonOffset);
        if (next !== processedSeason) {
          processedSeason = next;
          changed = true;
        }
      }
    }
  }

  return {
    text: processedText,
    episode: processedEpisode,
    season: processedSeason,
    changed,
  };
}
