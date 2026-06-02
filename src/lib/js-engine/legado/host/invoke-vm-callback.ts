/**
 * 在 QuickJS 宿主侧调用 VM 内函数（vm.dump 无法还原 QJS function）
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

export function invokeQuickJsStringCallback(
  vm: QuickJSContext,
  fnHandle: QuickJSHandle | undefined,
  body: string,
): void {
  if (!fnHandle) return;
  if (vm.typeof(fnHandle) !== 'function') return;
  const bodyHandle = vm.newString(body);
  try {
    const result = vm.callFunction(fnHandle, vm.undefined, [bodyHandle]);
    if (result.error) {
      result.error.dispose();
    } else {
      result.value.dispose();
    }
  } catch {
    /* ignore VM callback errors */
  } finally {
    bodyHandle.dispose();
  }
}
