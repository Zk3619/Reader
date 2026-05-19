/**
 * QuickJS WASM 运行时单例（规则 @js 与 Legado 书源脚本共用）
 */

import {
  getQuickJS,
  newQuickJSWASMModuleFromVariant,
  newVariant,
  RELEASE_SYNC,
  type QuickJSContext,
  type QuickJSWASMModule,
} from 'quickjs-emscripten';

/** 由 public/quickjs/ 提供；predev/prebuild 会从 node_modules 同步 */
const QUICKJS_WASM_URL = `${import.meta.env.BASE_URL}quickjs/emscripten-module.wasm`;

let quickJS: QuickJSWASMModule | null = null;
let useFallback = false;
let initPromise: Promise<void> | null = null;

export function isQuickJSFallback(): boolean {
  return useFallback;
}

export async function initQuickJSRuntime(): Promise<void> {
  if (quickJS || useFallback) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    try {
      const variant = newVariant(RELEASE_SYNC, { wasmLocation: QUICKJS_WASM_URL });
      quickJS = await newQuickJSWASMModuleFromVariant(variant);
    } catch (e1) {
      console.warn('[js-engine] QuickJS public wasm 加载失败，尝试 getQuickJS():', e1);
      try {
        quickJS = await getQuickJS();
      } catch (e2) {
        console.warn('[js-engine] QuickJS WASM 加载失败，将使用 Function 降级:', e2);
        useFallback = true;
      }
    }
  })();
  await initPromise;
}

export async function getQuickJSModule(): Promise<QuickJSWASMModule | null> {
  await initQuickJSRuntime();
  return quickJS;
}

export function createQuickJSContext(): QuickJSContext | null {
  if (!quickJS || useFallback) return null;
  return quickJS.newContext();
}

/** evalCode 后释放 value/error，避免 dispose 上下文时 gc 链表非空 */
export function evalCodeVoid(vm: QuickJSContext, code: string): void {
  const r = vm.evalCode(code);
  if (r.error) {
    const err = vm.dump(r.error);
    r.error.dispose();
    const msg =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    throw new Error(`QuickJS eval: ${msg}`);
  }
  r.value.dispose();
}

/** 将值写入 global 上的属性（字符串） */
export function setGlobalString(vm: QuickJSContext, name: string, value: string): void {
  const h = vm.newString(value);
  vm.setProp(vm.global, name, h);
  h.dispose();
}

/** 将 dump 后的 JSON 可序列化值写入 global（对象/数组/字符串/数字/boolean/null） */
export function setGlobalJson(vm: QuickJSContext, name: string, value: unknown): void {
  const json = JSON.stringify(value ?? null);
  evalCodeVoid(vm, `globalThis.${name} = ${json};`);
}

export const LEGADO_SUSPEND_MARKER = '__READER_LEGADO_SUSPEND__';
