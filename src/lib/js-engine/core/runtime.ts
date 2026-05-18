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

const QUICKJS_WASM_URL = '/quickjs/emscripten-module.wasm';

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
    } catch {
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

/** 将值写入 global 上的属性（字符串） */
export function setGlobalString(vm: QuickJSContext, name: string, value: string): void {
  const h = vm.newString(value);
  vm.setProp(vm.global, name, h);
  h.dispose();
}

/** 将 dump 后的 JSON 可序列化值写入 global（对象/数组/字符串/数字/boolean/null） */
export function setGlobalJson(vm: QuickJSContext, name: string, value: unknown): void {
  const json = JSON.stringify(value ?? null);
  vm.evalCode(`globalThis.${name} = ${json};`);
}

export const LEGADO_SUSPEND_MARKER = '__READER_LEGADO_SUSPEND__';
