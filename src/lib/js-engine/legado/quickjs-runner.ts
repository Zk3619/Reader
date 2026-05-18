/**
 * Legado 书源脚本 QuickJS 执行器（挂起循环 / 两轮 replay）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import {
  createQuickJSContext,
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
  /** suspend 模式：每次 ajax 完成后（如解析登录 cookie） */
  onAjaxSettled?: (resolvedUrl: string, body: string) => void;
  /** suspend 模式：注入 catch 重抛挂起标记 */
  wrapCatchRethrow?: boolean;
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

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Legado 脚本执行超时')), options.timeoutMs);
  });

  const scriptText = options.wrapCatchRethrow
    ? wrapLegadoCatchRethrow(options.script)
    : options.script;

  const runPromise = (async () => {
    try {
      options.inject(vm, rt);
      injectLegadoEncodingUtils(vm);

      if (options.mode === 'two-pass') {
        evalScript(vm, scriptText, rt);
        if (pending.length > 0) await Promise.all(pending);
        vm.evalCode('result = undefined;');
        pending.length = 0;
        evalScript(vm, scriptText, rt);
        if (pending.length > 0) await Promise.all(pending);
        return rt.getGlobalResult();
      }

      coordinator.resetReplayIndices();
      for (;;) {
        coordinator.pendingSuspend = null;
        const state = evalScript(vm, scriptText, rt);
        if (state.status === 'done') break;

        const s = state.suspend;

        let body = '';
        try {
          body = await s.promise;
        } catch (err) {
          body = err instanceof Error ? err.message : String(err);
        }
        coordinator.storeResult(
          s.writeIndex,
          s.resolvedUrl,
          body ?? '',
          s.requestStart,
          rt.applyAjaxDuration
        );
        options.onAjaxSettled?.(s.resolvedUrl, body ?? '');
      }

      while (pending.length > 0) {
        await Promise.all(pending.splice(0, pending.length));
      }

      return rt.getGlobalResult();
    } finally {
      vm.dispose();
    }
  })();

  return Promise.race([runPromise, timeoutPromise]);
}
