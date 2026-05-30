/**
 * 登录脚本（loginUrl）在 Reader 宿主上的兼容补丁
 */

/** clearDevice：避免 res.msg 为空时 toast「undefined」；失败时不调用 checkStatus 防止 ajax 挂起重放死循环 */
const CLEAR_DEVICE_FN_RE = /function clearDevice\s*\(\)\s*\{[\s\S]*?\n\}/;

export function patchLegadoLoginUrlScript(code: string): string {
  return code.replace(CLEAR_DEVICE_FN_RE, (fn) => patchClearDeviceFunction(fn));
}

function patchClearDeviceFunction(fn: string): string {
  if (!fn.includes('checkStatus')) return fn;

  let out = fn.replace(
    /java\.toast\s*\(\s*res\.code\s*==\s*0\s*\?[\s\S]*?:\s*res\.msg\s*\)/,
    "java.toast(res.code == 0 ? '\\n\\n📴设备清除成功' : (res.msg || res.message || '\\n清除设备失败'))",
  );

  out = out.replace(
    /(?:try\s*\{\s*)?Packages\.java\.lang\.Thread\.sleep\s*\(\s*500\s*\)\s*;?\s*(?:\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*)?\n\s*checkStatus\s*\(\s*\)\s*;?/,
    [
      'if (res.code == 0 || res.code == "0") {',
      '    try { Packages.java.lang.Thread.sleep(500); } catch (e) {}',
      '    checkStatus();',
      '}',
    ].join('\n'),
  );

  return out;
}
