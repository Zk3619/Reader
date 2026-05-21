import { LEGADO_SUSPEND_MARKER } from '@/lib/js-engine/core/runtime';

/**
 * 挂起重放时把顶层 const/let 换成 var，避免「已声明」错误（函数声明可重复）。
 * 仅用于 Legacy with+eval 路径；QuickJS 用 initScript 只 eval 一次。
 */
export function legadoLoginScriptForReplay(script: string): string {
  return script.replace(/^(\s*)(const|let)\s+/gm, '$1var ');
}

/** 书源 catch 块中重新抛出 ajax 挂起，避免被当成业务错误 */
export function wrapLegadoCatchRethrow(script: string): string {
  const marker = LEGADO_SUSPEND_MARKER;
  return script.replace(
    /\} catch \s*\(\s*(\w+)\s*\)\s*\{/g,
    (_m, id) =>
      `} catch (${id}) { if (${id} && (String(${id}) === '${marker}' || (typeof ${id} === 'object' && ${id} && String(${id}.message || '').indexOf('${marker}') >= 0))) throw ${id}; `
  );
}
