/**
 * 书源规则脚本兼容补丁
 * Legado Rhino 与浏览器 Function 语义差异
 */

import {
  EXPLORE_JSLIB_THIS_BIND_SHIM,
  GYKS_REQUEST_NO_SYNC_FAILOVER_SHIM,
} from '@/lib/js-engine/legado/source-script-shared';

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

/**
 * jsLib 中 paraForAndroid / paraForiOS / createSvg 等用 this.source、this.cache；
 * 浏览器 Function + with 下须显式 bind。
 */
export const RULE_SCRIPT_JSLIB_THIS_BIND_SHIM = `
(function __readerBindJsLibThis() {
  var __ctx = {};
  try {
    Object.defineProperties(__ctx, {
      java: { get: function() { return java; }, configurable: true },
      cache: { get: function() { return cache; }, configurable: true },
      source: { get: function() { return source; }, configurable: true },
    });
  } catch (e) {}
  if (typeof createSvg === 'function') {
    var __origCreateSvg = createSvg;
    __ctx.createSvg = function() {
      return __origCreateSvg.apply(__ctx, arguments);
    };
  }
  if (typeof paraForAndroid === 'function') {
    var __readerPfa = paraForAndroid;
    paraForAndroid = function(content, sources, ydv) {
      return __readerPfa.call(__ctx, content, sources, ydv);
    };
  }
  if (typeof paraForiOS === 'function') {
    var __readerPfi = paraForiOS;
    paraForiOS = function(content, sources, ydv) {
      return __readerPfi.call(__ctx, content, sources, ydv);
    };
  }
  if (typeof showCmt === 'function') {
    var __readerSc = showCmt;
    showCmt = function() {
      return __readerSc.apply(__ctx, arguments);
    };
  }
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

/** ruleToc.chapterUrl 等脚本常用 result.source，catalog 行字段可能是 sources */
const RESULT_SOURCE_ASSIGN_RE =
  /(\blet\s+sources\s*=\s*)result\.source\b/g;

/** ajax 首轮为空时 data 未解析，避免 content = data.content 后对 undefined .replace */
const CONTENT_FROM_DATA_RE = /content\s*=\s*data\.content\b/g;

/** ruleContent 在 hex 载荷为空时 JSON.parse(result) 会抛错并阻断多轮 ajax */
const RES_JSON_PARSE_RESULT_RE = /\bres\s*=\s*JSON\.parse\s*\(\s*result\s*\)/g;

const RES_JSON_PARSE_RESULT_SAFE =
  "res = (function(){ var __t = String(result == null ? '' : result).trim(); if (!__t) return {}; try { return JSON.parse(__t); } catch (e) { return {}; } })()";

/** ajax 首轮返回空串时避免 JSON.parse 抛错 */
const DATA_JSON_PARSE_RE = /\bdata\s*=\s*JSON\.parse\s*\(\s*data\s*\)/g;

const DATA_JSON_PARSE_SAFE =
  "data = (function(){ var __t = String(data == null ? '' : data).trim(); if (!__t) return data; try { return JSON.parse(__t); } catch (e) { return data; } })()";

/**
 * 修正正文/目录规则里在 `let res` 解析完成前引用未初始化 let 绑定的问题。
 * 不修改 `content = data.content` 等书源语义。
 */
export function patchLegadoRuleScript(code: string): string {
  let out = code;
  out = out.replace(JAVA_PUT_SOURCES_RE, "java.put('sources', res.sources)");
  out = out.replace(JAVA_PUT_TAB_RE, "java.put('tab', res.tab)");
  out = out.replace(JAVA_PUT_ITEM_ID_RE, "java.put('item_id', res.item_id)");
  out = out.replace(JAVA_PUT_TITLE_RE, "java.put('title', res.title)");
  out = out.replace(
    RESULT_SOURCE_ASSIGN_RE,
    "$1(result.source || result.sources || '')",
  );
  out = out.replace(
    CONTENT_FROM_DATA_RE,
    "content = (data && data.content != null ? String(data.content) : '')",
  );
  out = out.replace(RES_JSON_PARSE_RESULT_RE, RES_JSON_PARSE_RESULT_SAFE);
  out = out.replace(DATA_JSON_PARSE_RE, DATA_JSON_PARSE_SAFE);
  if (/\bcontent_url\s*=/.test(out) && !/\breturn\b/.test(out)) {
    out += '\nreturn content_url;';
  }
  return out;
}

/** jsLib + 兼容 shim + 已 patch 的规则脚本体 */
export function buildRuleScriptFullBody(
  patchedSnippet: string,
  jsLib: string,
): string {
  return [
    jsLib.trim(),
    PROCESS_CATALOG_LIST_SHIM,
    EXPLORE_JSLIB_THIS_BIND_SHIM,
    RULE_SCRIPT_JSLIB_THIS_BIND_SHIM,
    GYKS_REQUEST_NO_SYNC_FAILOVER_SHIM,
    patchedSnippet,
  ]
    .filter(Boolean)
    .join('\n');
}
