/**
 * 判断规则 @js 片段是否依赖书源 jsLib（远程 pictureHtml.js 等）。
 * 列表 ruleArticles 仅用 java.setContent/getElements 时不应加载 jsLib。
 */

import { JSLIB_STANDALONE_FUNCTION_NAMES } from '@/lib/js-engine/legado/source-script-shared';

const JSLIB_FUNCTION_CALL =
  /\b(?:danyeHtml|duoyeHtml|getHtmlSettings|getCloudSettings|getVariable|setVariable|BaseUrl|request|getUrl|getKey|getSecretKey|TD|setzt|setcsh|seturlm|start|update|getInfo)\s*\(/;

export function scriptReferencesJsLibFunctions(script: string): boolean {
  const t = String(script ?? '').trim();
  if (!t) return false;
  if (JSLIB_FUNCTION_CALL.test(t)) return true;
  const headCall = t.match(/^([a-zA-Z_$][\w$]*)\s*\(/);
  if (headCall && JSLIB_STANDALONE_FUNCTION_NAMES.has(headCall[1]!)) return true;
  if (/^\s*eval\s*\(\s*String\s*\(\s*source\.(?:loginUrl|jsLib)\s*\)\s*\)/.test(t)) {
    return true;
  }
  return false;
}
