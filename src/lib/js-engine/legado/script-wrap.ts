import { LEGADO_SUSPEND_MARKER } from '../core/runtime';

/** 书源 catch 块中重新抛出 ajax 挂起，避免被当成业务错误 */
export function wrapLegadoCatchRethrow(script: string): string {
  const marker = LEGADO_SUSPEND_MARKER;
  return script.replace(
    /\} catch \s*\(\s*(\w+)\s*\)\s*\{/g,
    (_m, id) =>
      `} catch (${id}) { if (${id} && (String(${id}) === '${marker}' || (typeof ${id} === 'object' && ${id} && String(${id}.message || '').indexOf('${marker}') >= 0))) throw ${id}; `
  );
}
