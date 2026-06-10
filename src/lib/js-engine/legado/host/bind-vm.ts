/**
 * QuickJS 宿主函数绑定工具
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

export function vmNewString(vm: QuickJSContext, value: string): QuickJSHandle {
  return vm.newString(value);
}

/** QuickJS 无参调用时 arg handle 可能为 undefined，直接 vm.dump 会抛 owner 错误 */
export function vmDumpOptional(vm: QuickJSContext, handle?: QuickJSHandle): unknown {
  if (handle === undefined) return undefined;
  try {
    const t = vm.typeof(handle);
    if (t === 'undefined') return undefined;
  } catch {
    return undefined;
  }
  return vm.dump(handle);
}

export function bindVmFunction(
  vm: QuickJSContext,
  target: QuickJSHandle,
  name: string,
  fn: (...args: QuickJSHandle[]) => QuickJSHandle | void
): void {
  const handle = vm.newFunction(name, (...args) => {
    try {
      const ret = fn(...args);
      // 勿用 vm.undefined：每次 void 回调会泄漏 handle，dispose 时触发 gc_obj_list 断言
      if (ret !== undefined) return ret;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  });
  vm.setProp(target, name, handle);
  handle.dispose();
}

export function bindVmObject(vm: QuickJSContext, globalName: string): QuickJSHandle {
  const obj = vm.newObject();
  vm.setProp(vm.global, globalName, obj);
  return obj;
}

/**
 * 在 global 上创建对象、绑定方法后 dispose 宿主侧 handle（quickjs-emscripten 要求，否则 vm.dispose 断言失败）
 */
export function bindGlobalVmObject(
  vm: QuickJSContext,
  globalName: string,
  bind: (obj: QuickJSHandle) => void
): void {
  const obj = bindVmObject(vm, globalName);
  bind(obj);
  obj.dispose();
}

/** 将 string 键值对写入新 QuickJS 对象（避免 evalCode 泄漏 handle） */
/** Legado StrResponse：java.startBrowserAwait(url).body() */
export function vmNewLegadoStrResponse(vm: QuickJSContext, body: string): QuickJSHandle {
  const obj = vm.newObject();
  const text = String(body ?? '');
  bindVmFunction(vm, obj, 'body', () => vm.newString(text));
  bindVmFunction(vm, obj, 'url', () => vm.newString(''));
  bindVmFunction(vm, obj, 'code', () => vm.newNumber(200));
  bindVmFunction(vm, obj, 'headers', () => vm.newObject());
  return obj;
}

export function vmNewStringRecordObject(
  vm: QuickJSContext,
  record: Record<string, string>
): QuickJSHandle {
  const obj = vm.newObject();
  for (const [k, v] of Object.entries(record)) {
    const valHandle = vm.newString(String(v ?? ''));
    vm.setProp(obj, k, valHandle);
    valHandle.dispose();
  }
  return obj;
}
