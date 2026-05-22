/**
 * 前端 JavaScript 引擎
 *
 * - core：QuickJS WASM 单例（规则 @js 与 Legado 脚本共用）
 * - quickjs-sandbox：规则解析 @js: 片段
 * - legado：书源 loginUrl / exploreUrl（QuickJS 优先，Function + with 降级）
 */

export {
  createQuickJSContext,
  initQuickJSRuntime,
  isQuickJSFallback,
  LEGADO_SUSPEND_MARKER,
} from '@/lib/js-engine/core/runtime';

export { evalJs, initJsSandbox, isJsSandboxFallback, type JsContext } from '@/lib/js-engine/quickjs-sandbox';

export { installScriptDateShim, type ScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
export { SuspendScript } from '@/lib/js-engine/legado/suspend-script';
export { runLegadoScriptQuickJS, type LegadoInjector, type LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';

export {
  clearSourceLoginState,
  clearSourceLoginStateLocalStorageOnly,
  getStoredLoginInfo,
  getStoredSourceCookiesForUrl,
  getStoredSourceCookiesForCover,
  getStoredSourceCookiesMerged,
  readSourceCookieStore,
  cookieStorageKeyToOrigin,
  runLoginScript,
  runLoginScriptRust,
  type RunLoginScriptOptions,
  type RunLoginScriptRustOutput,
  type UrlWithCookies,
} from '@/lib/js-engine/legado/login-script-runner';

export { extractExploreScript, runExploreScript } from '@/lib/js-engine/legado/explore-script-runner';
export {
  getScriptBaseUrl,
  getSourceUrlIdentifier,
} from '@/lib/js-engine/legado/source-script-shared';
