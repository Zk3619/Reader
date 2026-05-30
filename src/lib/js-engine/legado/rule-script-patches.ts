/**
 * 聚合/晴天等书源规则脚本兼容补丁
 * Legado Rhino 与浏览器 Function 语义差异
 */

const RULE_SCRIPT_PRELUDE = `
function __readerExtractApiContent(data) {
  if (data == null) return '';
  if (typeof data.content === 'string') return data.content;
  if (data.data != null) {
    if (typeof data.data === 'string') return data.data;
    if (typeof data.data.content === 'string') return data.data.content;
  }
  if (typeof data.msg === 'string' && data.msg.trim()) return data.msg;
  return '';
}
`.trim();

/**
 * jsLib 中 processCatalogList 常在 java.ajax 之后立刻 JSON.parse；
 * Web 端 ajax 首轮为空，须跳过解析以便多轮重跑拿到响应。
 */
const PROCESS_CATALOG_LIST_SHIM = `
(function __readerWrapProcessCatalogList() {
  if (typeof processCatalogList !== 'function') return;
  var __readerOrigProcessCatalogList = processCatalogList;
  processCatalogList = function __readerProcessCatalogList(data) {
    var t = data == null ? '' : String(data).trim();
    if (!t) return [];
    try {
      return __readerOrigProcessCatalogList(data);
    } catch (e) {
      try { JSON.parse(t); } catch (parseErr) { return []; }
      throw e;
    }
  };
})();
`.trim();

/** java.put('sources', sources) 在 let sources = res.sources 之前 → 改为 res.sources */
const JAVA_PUT_SOURCES_RE =
  /java\.put\s*\(\s*['"]sources['"]\s*,\s*sources\s*\)/g;

const JAVA_PUT_TAB_RE =
  /java\.put\s*\(\s*['"]tab['"]\s*,\s*tab\s*\)/g;

const JAVA_PUT_ITEM_ID_RE =
  /java\.put\s*\(\s*['"]item_id['"]\s*,\s*item_id\s*\)/g;

const JAVA_PUT_TITLE_RE =
  /java\.put\s*\(\s*['"]title['"]\s*,\s*title\s*\)/g;

const CONTENT_FROM_DATA_RE = /content\s*=\s*data\.content\b/g;

/**
 * 修正正文/目录规则里在 `let res` 解析完成前引用未初始化 let 绑定的问题
 */
export function patchLegadoRuleScript(code: string): string {
  let out = code;
  out = out.replace(JAVA_PUT_SOURCES_RE, "java.put('sources', res.sources)");
  out = out.replace(JAVA_PUT_TAB_RE, "java.put('tab', res.tab)");
  out = out.replace(JAVA_PUT_ITEM_ID_RE, "java.put('item_id', res.item_id)");
  out = out.replace(JAVA_PUT_TITLE_RE, "java.put('title', res.title)");
  out = out.replace(CONTENT_FROM_DATA_RE, 'content = __readerExtractApiContent(data)');
  if (/\bcontent_url\s*=/.test(out) && !/\breturn\b/.test(out)) {
    out += '\n;return content_url;';
  }
  return out;
}

/** jsLib + 兼容 prelude + 已 patch 的规则脚本体 */
export function buildRuleScriptFullBody(
  patchedSnippet: string,
  jsLib: string,
): string {
  return [jsLib.trim(), RULE_SCRIPT_PRELUDE, PROCESS_CATALOG_LIST_SHIM, patchedSnippet]
    .filter(Boolean)
    .join('\n');
}
