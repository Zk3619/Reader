/**
 * Legado RuleAnalyzer 的 TypeScript 实现
 * 对应 io.legado.app.model.analyzeRule.RuleAnalyzer
 *
 * 用于在规则字符串含 JSONPath/CSS 筛选器时，安全切分 && / || / %%
 */

const ESC = '\\';

export type RuleSplitOp = '&&' | '||' | '%%';
export type RuleSplitToken = RuleSplitOp | '@';

export class RuleAnalyzer {
  private queue: string;
  private pos = 0;
  private start = 0;
  private startX = 0;
  private rule: string[] = [];
  private step = 0;
  elementsType = '';
  private readonly chompBalanced: (open: string, close: string) => boolean;

  constructor(data: string, code = false) {
    this.queue = data;
    this.chompBalanced = code
      ? (open, close) => this.chompCodeBalanced(open, close)
      : (open, close) => this.chompRuleBalanced(open, close);
  }

  trimRule(): void {
    if (this.pos >= this.queue.length) return;
    if (this.queue[this.pos] === '@' || this.queue[this.pos] < '!') {
      this.pos += 1;
      while (this.pos < this.queue.length && (this.queue[this.pos] === '@' || this.queue[this.pos] < '!')) {
        this.pos += 1;
      }
      this.start = this.pos;
      this.startX = this.pos;
    }
  }

  reSetPos(): void {
    this.pos = 0;
    this.startX = 0;
  }

  private consumeTo(seq: string): boolean {
    this.start = this.pos;
    const offset = this.queue.indexOf(seq, this.pos);
    if (offset !== -1) {
      this.pos = offset;
      return true;
    }
    return false;
  }

  private consumeToAny(...seq: string[]): boolean {
    let p = this.pos;
    while (p !== this.queue.length) {
      for (const s of seq) {
        if (this.queue.startsWith(s, p)) {
          this.step = s.length;
          this.pos = p;
          return true;
        }
      }
      p += 1;
    }
    return false;
  }

  private findToAny(...seq: string[]): number {
    let p = this.pos;
    while (p !== this.queue.length) {
      for (const s of seq) {
        if (this.queue[p] === s) return p;
      }
      p += 1;
    }
    return -1;
  }

  private chompCodeBalanced(open: string, close: string): boolean {
    let p = this.pos;
    let depth = 0;
    let otherDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    while (true) {
      if (p === this.queue.length) break;
      const c = this.queue[p++];
      if (c !== ESC) {
        if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
        else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
        if (inSingleQuote || inDoubleQuote) continue;
        if (c === '[') depth += 1;
        else if (c === ']') depth -= 1;
        else if (depth === 0) {
          if (c === open) otherDepth += 1;
          else if (c === close) otherDepth -= 1;
        }
      } else {
        p += 1;
      }
      if (depth <= 0 && otherDepth <= 0) break;
    }

    if (depth > 0 || otherDepth > 0) return false;
    this.pos = p;
    return true;
  }

  private chompRuleBalanced(open: string, close: string): boolean {
    let p = this.pos;
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    while (true) {
      if (p === this.queue.length) break;
      const c = this.queue[p++];
      if (c === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      else if (c === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
      else if (inSingleQuote || inDoubleQuote) continue;
      else if (c === ESC) {
        p += 1;
        continue;
      } else if (c === open) depth += 1;
      else if (c === close) depth -= 1;
      if (depth <= 0) break;
    }

    if (depth > 0) return false;
    this.pos = p;
    return true;
  }

  splitRule(...split: string[]): string[] {
    if (split.length === 1) {
      this.elementsType = split[0];
      if (!this.consumeTo(split[0])) {
        this.rule.push(this.queue.substring(this.startX));
        return this.rule;
      }
      this.step = split[0].length;
      return this.splitRuleNext();
    }
    if (!this.consumeToAny(...split)) {
      this.rule.push(this.queue.substring(this.startX));
      return this.rule;
    }
    return this.splitRuleContinue(...split);
  }

  private splitRuleContinue(...split: string[]): string[] {
    const end = this.pos;
    this.pos = this.start;

    while (true) {
      const st = this.findToAny('[', '(');
      if (st === -1) {
        this.rule = [this.queue.substring(this.startX, end)];
        this.elementsType = this.queue.substring(end, end + this.step);
        this.pos = end + this.step;
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos));
          this.pos += this.step;
        }
        this.rule.push(this.queue.substring(this.pos));
        return this.rule;
      }

      if (st > end) {
        this.rule = [this.queue.substring(this.startX, end)];
        this.elementsType = this.queue.substring(end, end + this.step);
        this.pos = end + this.step;
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos));
          this.pos += this.step;
        }
        if (this.pos > st) {
          this.startX = this.start;
          return this.splitRule(...split);
        }
        this.rule.push(this.queue.substring(this.pos));
        return this.rule;
      }

      this.pos = st;
      const next = this.queue[this.pos] === '[' ? ']' : ')';
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        throw new Error(`${this.queue.substring(0, this.start)}后未平衡`);
      }
      if (end <= this.pos) {
        this.start = this.pos;
        return this.splitRule(...split);
      }
    }
  }

  private splitRuleNext(): string[] {
    const end = this.pos;
    this.pos = this.start;

    while (true) {
      const st = this.findToAny('[', '(');
      if (st === -1) {
        this.rule.push(this.queue.substring(this.startX, end));
        this.pos = end + this.step;
        while (this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.start, this.pos));
          this.pos += this.step;
        }
        this.rule.push(this.queue.substring(this.pos));
        return this.rule;
      }

      if (st > end) {
        this.rule.push(this.queue.substring(this.startX, end));
        this.pos = end + this.step;
        while (this.consumeTo(this.elementsType) && this.pos < st) {
          this.rule.push(this.queue.substring(this.start, this.pos));
          this.pos += this.step;
        }
        if (this.pos > st) {
          this.startX = this.start;
          return this.splitRuleNext();
        }
        this.rule.push(this.queue.substring(this.pos));
        return this.rule;
      }

      this.pos = st;
      const next = this.queue[this.pos] === '[' ? ']' : ')';
      if (!this.chompBalanced(this.queue[this.pos], next)) {
        throw new Error(`${this.queue.substring(0, this.start)}后未平衡`);
      }
      if (end <= this.pos) {
        this.start = this.pos;
        if (!this.consumeTo(this.elementsType)) {
          this.rule.push(this.queue.substring(this.startX));
          return this.rule;
        }
        return this.splitRuleNext();
      }
    }
  }

  /** 替换内嵌规则，如 {$....} */
  innerRule(
    inner: string,
    startStep: number,
    endStep: number,
    fr: (innerRule: string) => string | null | undefined,
  ): string {
    const st: string[] = [];
    while (this.consumeTo(inner)) {
      const posPre = this.pos;
      if (this.chompCodeBalanced('{', '}')) {
        const frv = fr(this.queue.substring(posPre + startStep, this.pos - endStep));
        if (frv != null && frv !== '') {
          st.push(this.queue.substring(this.startX, posPre) + frv);
          this.startX = this.pos;
          continue;
        }
      }
      this.pos += inner.length;
    }
    if (this.startX === 0) return '';
    st.push(this.queue.substring(this.startX));
    return st.join('');
  }
}

/** 使用 RuleAnalyzer 切分顶层组合运算符（对齐 Legado splitRule("&&","||","%%")） */
export function splitRuleByOperators(
  rule: string,
  code = false,
): { parts: string[]; op: RuleSplitOp | null } {
  const trimmed = rule.trim();
  if (!trimmed) return { parts: [], op: null };
  try {
    const analyzer = new RuleAnalyzer(trimmed, code);
    const parts = analyzer.splitRule('&&', '||', '%%');
    const normalized = parts.map((p) => p.trim()).filter(Boolean);
    if (normalized.length > 1) {
      const op = (analyzer.elementsType as RuleSplitOp) || '&&';
      return { parts: normalized, op };
    }
  } catch {
    // fall through
  }
  return { parts: [trimmed], op: null };
}

/** 仅切分 || / %%（正则规则内的 && 留给 AnalyzeByRegex 段内串联） */
export function splitRuleByFallbackOperators(
  rule: string,
): { parts: string[]; op: '||' | '%%' | null } {
  const trimmed = rule.trim();
  if (!trimmed) return { parts: [], op: null };
  try {
    const analyzer = new RuleAnalyzer(trimmed, false);
    const parts = analyzer.splitRule('||', '%%');
    const normalized = parts.map((p) => p.trim()).filter(Boolean);
    if (normalized.length > 1) {
      const op = analyzer.elementsType as '||' | '%%';
      if (op === '||' || op === '%%') {
        return { parts: normalized, op };
      }
    }
  } catch {
    // fall through
  }
  return { parts: [trimmed], op: null };
}

function zipMergeRuleParts<T>(groups: T[][]): T[] {
  if (groups.length === 0) return [];
  if (groups.length === 1) return groups[0];
  const out: T[] = [];
  const maxLen = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const g of groups) {
      if (i < g.length) out.push(g[i]);
    }
  }
  return out;
}

/** 正则规则顶层仅合并 || / %%；&& 在段内由 AnalyzeByRegex 串联 */
export function mergeRegexRulePartsSync<T>(
  rule: string,
  evalPart: (part: string) => T[],
): T[] {
  const { parts, op } = splitRuleByFallbackOperators(rule);
  if (!op || parts.length <= 1) {
    return evalPart(rule);
  }

  if (op === '||') {
    for (const part of parts) {
      const r = evalPart(part);
      if (r.length > 0) return r;
    }
    return [];
  }

  const groups: T[][] = [];
  for (const part of parts) {
    const r = evalPart(part);
    if (r.length > 0) groups.push(r);
  }
  return zipMergeRuleParts(groups);
}

export function zipMergeRuleResults(groups: string[][]): string[] {
  if (groups.length === 0) return [];
  if (groups.length === 1) return groups[0];
  const out: string[] = [];
  const maxLen = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const g of groups) {
      if (i < g.length) out.push(g[i]);
    }
  }
  return out;
}

export function mergeRulePartsSync<T>(
  rule: string,
  evalPart: (part: string) => T[],
  toStrings: (items: T[]) => string[],
): string[] {
  const { parts, op } = splitRuleByOperators(rule);
  if (!op || parts.length <= 1) {
    return toStrings(evalPart(rule));
  }

  if (op === '||') {
    for (const part of parts) {
      const r = toStrings(evalPart(part));
      if (r.length > 0) return r;
    }
    return [];
  }

  if (op === '%%') {
    const groups: string[][] = [];
    for (const part of parts) {
      const r = toStrings(evalPart(part));
      if (r.length > 0) groups.push(r);
    }
    return zipMergeRuleResults(groups);
  }

  const out: string[] = [];
  for (const part of parts) {
    out.push(...toStrings(evalPart(part)));
  }
  return out.filter((r) => r.trim().length > 0);
}

export async function mergeRuleParts<T>(
  rule: string,
  evalPart: (part: string) => Promise<T[]>,
  toStrings: (items: T[]) => string[],
): Promise<string[]> {
  const { parts, op } = splitRuleByOperators(rule);
  if (!op || parts.length <= 1) {
    return toStrings(await evalPart(rule));
  }

  if (op === '||') {
    for (const part of parts) {
      const r = toStrings(await evalPart(part));
      if (r.length > 0) return r;
    }
    return [];
  }

  if (op === '%%') {
    const groups: string[][] = [];
    for (const part of parts) {
      const r = toStrings(await evalPart(part));
      if (r.length > 0) groups.push(r);
    }
    return zipMergeRuleResults(groups);
  }

  const out: string[] = [];
  for (const part of parts) {
    out.push(...toStrings(await evalPart(part)));
  }
  return out.filter((r) => r.trim().length > 0);
}
