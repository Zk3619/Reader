/**
 * Legado QuickJS VM 执行深度：宿主回调间隙可能跑微任务，须避免同步 Solid UI。
 */

let legadoScriptVmDepth = 0;

export function getLegadoScriptVmDepth(): number {
  return legadoScriptVmDepth;
}

export function withLegadoScriptVm<T>(fn: () => T): T {
  legadoScriptVmDepth += 1;
  try {
    return fn();
  } finally {
    legadoScriptVmDepth -= 1;
  }
}
