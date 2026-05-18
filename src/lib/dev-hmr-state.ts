/**
 * 开发环境 Vite HMR：在 import.meta.hot.data 中持久化 UI 状态，
 * 避免热更新后 App 局部 signal 重置而与 store / 子组件缓存不一致。
 */

export function readHmrData<T>(key: string, fallback: T): T {
  if (import.meta.env.DEV && import.meta.hot) {
    const bag = import.meta.hot.data as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(bag, key)) {
      return bag[key] as T;
    }
  }
  return fallback;
}

export function writeHmrData<T>(key: string, value: T): void {
  if (import.meta.env.DEV && import.meta.hot) {
    (import.meta.hot.data as Record<string, unknown>)[key] = value;
  }
}
