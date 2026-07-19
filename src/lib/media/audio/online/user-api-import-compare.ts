/**
 * 自定义音源导入前与本地比对（对齐书源 comparison + LX 按脚本文本去重）
 */

import type { UserApiScript } from '@/lib/media/audio/online/user-api-engine';
import type { IdentifiedUserApiScript } from '@/lib/media/audio/online/user-api-import-identify';

export interface ImportUserApiComparison {
  source: IdentifiedUserApiScript;
  existing: UserApiScript | null;
  isNew: boolean;
  isUpdate: boolean;
}

/** 脚本文本规范化后再比对，避免仅换行差异被当成不同源 */
export function normalizeUserApiScriptForCompare(script: string): string {
  return script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function findExistingByScriptContent(
  script: string,
  locals: UserApiScript[],
): UserApiScript | null {
  const normalized = normalizeUserApiScriptForCompare(script);
  if (!normalized) return null;
  for (const local of locals) {
    if (normalizeUserApiScriptForCompare(local.script) === normalized) return local;
  }
  return null;
}

function findExistingByName(name: string, locals: UserApiScript[]): UserApiScript | null {
  const key = name.trim();
  if (!key) return null;
  for (const local of locals) {
    if (local.name.trim() === key) return local;
  }
  return null;
}

/** 简单版本比较：a > b 返回正数；无法解析时回退字符串比较 */
export function compareUserApiVersions(a?: string, b?: string): number {
  const left = (a ?? '').trim().replace(/^v+/i, '');
  const right = (b ?? '').trim().replace(/^v+/i, '');
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const leftParts = left.split(/[.+_-]/).map((p) => Number.parseInt(p, 10));
  const rightParts = right.split(/[.+_-]/).map((p) => Number.parseInt(p, 10));
  const numeric =
    leftParts.every((n) => Number.isFinite(n)) && rightParts.every((n) => Number.isFinite(n));
  if (numeric) {
    const len = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < len; i++) {
      const lv = leftParts[i] ?? 0;
      const rv = rightParts[i] ?? 0;
      if (lv !== rv) return lv - rv;
    }
    return 0;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareOne(
  source: IdentifiedUserApiScript,
  locals: UserApiScript[],
): ImportUserApiComparison {
  const byContent = findExistingByScriptContent(source.script, locals);
  if (byContent) {
    return { source, existing: byContent, isNew: false, isUpdate: false };
  }
  const byName = findExistingByName(source.name, locals);
  if (byName) {
    // 同名且内容不同：视为可更新（内容相同已在上面归为「已有」）
    return { source, existing: byName, isNew: false, isUpdate: true };
  }
  return { source, existing: null, isNew: true, isUpdate: false };
}

export function buildUserApiImportComparisons(
  sources: IdentifiedUserApiScript[],
  locals: UserApiScript[],
): ImportUserApiComparison[] {
  const usableLocals = locals.filter((s) => s.initStatus !== 'failed');
  const result: ImportUserApiComparison[] = [];
  /** 批次内已出现的规范化脚本，避免同批重复勾选 */
  const seenScripts = new Set<string>();

  for (const source of sources) {
    const normalizedScript = normalizeUserApiScriptForCompare(source.script);
    if (normalizedScript && seenScripts.has(normalizedScript)) {
      result.push({ source, existing: null, isNew: false, isUpdate: false });
      continue;
    }
    result.push(compareOne(source, usableLocals));
    if (normalizedScript) seenScripts.add(normalizedScript);
  }
  return result;
}

/** 默认勾选：新增，或同名内容有变化/版本更新的源；已有（内容完全相同）不勾选 */
export function defaultUserApiImportSelection(
  comparisons: ImportUserApiComparison[],
): Set<string> {
  return new Set(
    comparisons.filter((c) => c.isNew || c.isUpdate).map((c) => c.source.id),
  );
}
