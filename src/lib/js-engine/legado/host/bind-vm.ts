/**
 * QuickJS 宿主函数绑定工具
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

export function vmNewString(vm: QuickJSContext, value: string): QuickJSHandle {
  return vm.newString(value);
}

export function bindVmFunction(
  vm: QuickJSContext,
  target: QuickJSHandle,
  name: string,
  fn: (...args: QuickJSHandle[]) => QuickJSHandle | void
): void {
  const handle = vm.newFunction(name, (...args) => {
    const ret = fn(...args);
    return ret ?? vm.undefined;
  });
  vm.setProp(target, name, handle);
  handle.dispose();
}

export function bindVmObject(vm: QuickJSContext, globalName: string): QuickJSHandle {
  const obj = vm.newObject();
  vm.setProp(vm.global, globalName, obj);
  return obj;
}
