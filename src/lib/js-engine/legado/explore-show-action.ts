/**
 * 光遇/晴天等发现页 select action：`show(infoMap['标题'],'paramKey')`
 * 在宿主侧执行，避免为整包 jsLib 启动 QuickJS（易触发 WASM GC 断言）。
 */

import type { BookSource } from '@/types';
import {
  createSourceVariableHandlers,
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';

/** 对齐 jsLib createFilter 生成的 action 字符串 */
const SHOW_INFOMAP_ACTION_RE =
  /^show\s*\(\s*infoMap\s*\[\s*(['"])([^'"]+)\1\s*\]\s*,\s*(['"])([^'"]+)\3\s*\)\s*;?\s*$/;

export function parseExploreShowInfoMapAction(
  action: string,
): { title: string; paramKey: string } | null {
  const m = action.trim().match(SHOW_INFOMAP_ACTION_RE);
  if (!m) return null;
  return { title: m[2]!, paramKey: m[4]! };
}

export type RunExploreShowActionOptions = {
  infoMap?: Record<string, string>;
  onRefreshExplore?: () => void | Promise<void>;
};

/** 对齐 jsLib show(m, t)：写入书源变量并刷新发现页 */
export function runExploreShowActionNative(
  source: BookSource,
  parsed: { title: string; paramKey: string },
  options?: RunExploreShowActionOptions,
): void {
  const value = String(options?.infoMap?.[parsed.title] ?? '').trim();
  const argsKey = getSourceArgsKey(source);
  const sourceVars = createSourceVariableHandlers(source, argsKey);

  let data: Record<string, unknown> = {};
  try {
    const raw = sourceVars.getVariable();
    if (raw) data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  data[parsed.paramKey] = value;
  if (parsed.paramKey === '发现页类型') {
    data['发现页来源'] = '番茄';
  }

  sourceVars.setVariable(JSON.stringify(data, null, 2));
  void options?.onRefreshExplore?.();
}

/** 若为 show(infoMap[...]) 则宿主执行并返回 true */
export function tryRunExploreShowActionNative(
  source: BookSource,
  action: string,
  options?: RunExploreShowActionOptions,
): boolean {
  const parsed = parseExploreShowInfoMapAction(action);
  if (!parsed) return false;
  runExploreShowActionNative(source, parsed, options);
  return true;
}
