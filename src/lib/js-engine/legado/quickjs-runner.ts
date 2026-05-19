/**
 * Legado 书源脚本 QuickJS 执行器（挂起循环 / 两轮 replay）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import {
  createQuickJSContext,
  evalCodeVoid,
  initQuickJSRuntime,
  isQuickJSFallback,
  LEGADO_SUSPEND_MARKER,
} from '../core/runtime';
import { injectLegadoEncodingUtils } from './host/encode-vm';
import { AjaxCoordinator, type AjaxCoordinatorMode } from './host/ajax-coordinator';
import { SuspendScript } from './suspend-script';
import { wrapLegadoCatchRethrow } from './script-wrap';

export type LegadoInjector = (vm: QuickJSContext, rt: LegadoRunRuntime) => void;

export interface LegadoRunRuntime {
  coordinator: AjaxCoordinator;
  pending: Promise<unknown>[];
  setGlobalResult: (value: unknown) => void;
  getGlobalResult: () => unknown;
  applyAjaxDuration?: (ms: number) => void;
}

export interface RunLegadoScriptQuickJSOptions {
  script: string;
  baseUrl: string;
  timeoutMs: number;
  mode: AjaxCoordinatorMode;
  inject: LegadoInjector;
  /**
   * suspend 模式：先 eval 一次（loginUrl/jsLib 定义函数），挂起重放时仅 eval `script`（action），
   * 避免每次 ajax 后重跑 `login(true)` 误判「已登录」。
   */
  initScript?: string;
  /** suspend 模式：每次 ajax 完成后（如解析登录 cookie） */
  onAjaxSettled?: (resolvedUrl: string, body: string) => void;
  /** suspend 模式：注入 catch 重抛挂起标记 */
  wrapCatchRethrow?: boolean;
  /** 每次 eval 前调用（挂起重放时刷新 global result 等） */
  beforeEval?: (vm: QuickJSContext) => void;
}

/** ajax 挂起 / two-pass 会在同一 VM 内多次 eval 整段脚本；IIFE 避免顶层 const/let 重复声明 */
function wrapScriptForReeval(script: string): string {
  return `(function(){\n${script}\n})();`;
}

function readGlobalResult(vm: QuickJSContext): unknown {
  const rh = vm.getProp(vm.global, 'result');
  if (!rh) return undefined;
  try {
    return vm.dump(rh);
  } finally {
    rh.dispose();
  }
}

function evalScript(
  vm: QuickJSContext,
  script: string,
  rt: LegadoRunRuntime
): { status: 'done' } | { status: 'suspend'; suspend: SuspendScript } {
  const r = vm.evalCode(script);
  if (r.error) {
    const err = vm.dump(r.error);
    r.error.dispose();
    const msg =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    const suspend = rt.coordinator.pendingSuspend;
    if (msg === LEGADO_SUSPEND_MARKER || suspend) {
      if (!suspend) {
        throw new Error('Legado ajax 挂起状态丢失');
      }
      return { status: 'suspend', suspend };
    }
    throw new Error(`Legado script error: ${msg}`);
  }
  r.value.dispose();
  rt.setGlobalResult(readGlobalResult(vm));
  return { status: 'done' };
}

export async function runLegadoScriptQuickJS(
  options: RunLegadoScriptQuickJSOptions
): Promise<unknown> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) {
    throw new Error('QuickJS unavailable');
  }

  const vm = createQuickJSContext();
  if (!vm) throw new Error('QuickJS context unavailable');

  const coordinator = new AjaxCoordinator(options.mode, false);
  let globalResult: unknown;
  const pending: Promise<unknown>[] = [];

  const rt: LegadoRunRuntime = {
    coordinator,
    pending,
    setGlobalResult: (v) => {
      globalResult = v;
    },
    getGlobalResult: () => globalResult,
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: ((e: Error) => void) | undefined;
  const armScriptTimeout = () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(
      () => rejectTimeout?.(new Error('Legado 脚本执行超时')),
      options.timeoutMs
    );
  };
  const disarmScriptTimeout = () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = undefined;
  };
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
    armScriptTimeout();
  });

  const scriptBody = options.wrapCatchRethrow
    ? wrapLegadoCatchRethrow(options.script)
    : options.script;
  const scriptText = wrapScriptForReeval(scriptBody);

  const runPromise = (async () => {
    try {
      options.inject(vm, rt);
      injectLegadoEncodingUtils(vm);

      if (options.mode === 'two-pass') {
        options.beforeEval?.(vm);
        evalScript(vm, scriptText, rt);
        if (pending.length > 0) await Promise.all(pending);
        evalCodeVoid(vm, 'result = undefined;');
        pending.length = 0;
        options.beforeEval?.(vm);
        evalScript(vm, scriptText, rt);
        if (pending.length > 0) await Promise.all(pending);
        return rt.getGlobalResult();
      }

      coordinator.resetReplayIndices();
      if (options.initScript) {
        // 不用 IIFE：function login() 等须挂在 global，供挂起重放的 action 调用
        evalCodeVoid(vm, options.initScript);
      }
      const suspendEvalText = options.initScript ? options.script : scriptText;
      for (;;) {
        coordinator.pendingSuspend = null;
        options.beforeEval?.(vm);
        const state = evalScript(vm, suspendEvalText, rt);
        if (state.status === 'done') break;

        const s = state.suspend;

        let body = '';
        disarmScriptTimeout();
        try {
          try {
            body = await s.promise;
          } catch (err) {
            body = err instanceof Error ? err.message : String(err);
          }
        } finally {
          armScriptTimeout();
        }
        if (s.writeIndex >= 0) {
          coordinator.storeResult(
            s.writeIndex,
            s.resolvedUrl,
            body ?? '',
            s.requestStart
          );
          options.onAjaxSettled?.(s.resolvedUrl, body ?? '');
        }
      }

      while (pending.length > 0) {
        await Promise.all(pending.splice(0, pending.length));
      }

      return rt.getGlobalResult();
    } finally {
      disarmScriptTimeout();
      vm.dispose();
    }
  })();

  try {
    return await Promise.race([runPromise, timeoutPromise]);
  } finally {
    disarmScriptTimeout();
  }
}
