/**
 * 判断规则 @js 片段是否依赖书源 jsLib（远程 pictureHtml.js 等）。
 * 列表 ruleArticles 仅用 java.setContent/getElements 时不应加载 jsLib。
 */

const JSLIB_FUNCTION_CALL =
  /\b(?:danyeHtml|duoyeHtml|getHtmlSettings|getCloudSettings|getVariable|setVariable|BaseUrl|request)\s*\(/;

export function scriptReferencesJsLibFunctions(script: string): boolean {
  return JSLIB_FUNCTION_CALL.test(String(script ?? ''));
}
