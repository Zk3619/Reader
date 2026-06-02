/**
 * 平台环境检测工具
 * 
 * Tauri 2.0 官方推荐的环境检测方式
 * 参考：https://tauri.app/v2
 */

/**
 * 检测是否在 Tauri 环境中
 * 
 * Tauri 2.0 官方推荐方式：检查 window.__TAURI__ 对象
 * 该对象由 Tauri 在 WebView 启动时注入，纯 Web 环境不存在
 * 
 * @returns 如果在 Tauri 环境中返回 true，否则返回 false
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // Tauri 2 运行时标记（withGlobalTauri: false 时仍由壳注入）
  const g = globalThis as typeof globalThis & { isTauri?: boolean };
  if (g.isTauri === true) {
    return true;
  }
  // Tauri CLI 构建/开发时注入
  if (import.meta.env.TAURI_ENV_PLATFORM != null && import.meta.env.TAURI_ENV_PLATFORM !== '') {
    return true;
  }
  const win = window as Window & { __TAURI__?: unknown };
  return typeof win.__TAURI__ !== 'undefined';
}

/**
 * 严格检测是否在 Tauri 环境中（增强验证）
 * 
 * 除了检查 __TAURI__ 对象外，还验证关键 API 是否存在
 * 用于防止极端情况下的模拟
 * 
 * @returns 如果在 Tauri 环境中且 API 可用返回 true，否则返回 false
 */
export function isTauriStrict(): boolean {
  if (!isTauri()) {
    return false;
  }
  if (import.meta.env.TAURI_ENV_PLATFORM != null) {
    return true;
  }
  const win = window as Window & { __TAURI__?: { invoke?: unknown; convertFileSrc?: unknown } };
  const tauri = win.__TAURI__;
  return (
    typeof tauri !== 'undefined' &&
    typeof tauri.invoke === 'function' &&
    typeof tauri.convertFileSrc === 'function'
  );
}

/**
 * 检测是否在 Web 环境中
 * 
 * @returns 如果在 Web 环境（非 Tauri）中返回 true，否则返回 false
 */
export function isWeb(): boolean {
  return !isTauri();
}

/**
 * 检测是否为移动端（手机/平板）
 * 用于隐藏桌面端专属功能（如沉浸模式按钮、窗口控制按钮等）
 * 
 * @returns 如果在移动端（Android/iOS 等）返回 true，否则返回 false
 */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

/** 是否 Android（含 Tauri WebView） */
export function isAndroid(): boolean {
  if (import.meta.env.TAURI_ENV_PLATFORM === 'android') return true;
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * 缓存的环境检测结果（避免重复检测）
 */
let _cachedIsTauri: boolean | null = null;

/**
 * 获取缓存的 Tauri 环境检测结果
 * 
 * 首次调用时会执行检测并缓存结果
 * 
 * @returns 如果在 Tauri 环境中返回 true，否则返回 false
 */
export function getCachedIsTauri(): boolean {
  if (_cachedIsTauri === null) {
    _cachedIsTauri = isTauri();
  }
  return _cachedIsTauri;
}

/**
 * 重置缓存的环境检测结果
 * 
 * 主要用于测试场景
 */
export function resetCache(): void {
  _cachedIsTauri = null;
}
