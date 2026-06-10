/**
 * 登录脚本（loginUrl）在 Reader 宿主上的兼容补丁
 */

/** clearDevice：避免 res.msg 为空时 toast「undefined」；失败时不调用 checkStatus 防止 ajax 挂起重放死循环 */
const CLEAR_DEVICE_FN_RE = /function clearDevice\s*\(\)\s*\{[\s\S]*?\n\}/;

/**
 * 晴天聚合：control() 打开 /control 时若 controlUrl 与 server 不一致，
 * 仅用 server 作当次打开 URL 的初值（不写回 controlUrl，保留 Legado 两套字段语义）。
 */
const QINGTIAN_CONTROL_FN_HEAD_RE =
  /(function control\s*\(\)\s*\{\s*)(controlUrla\s*=\s*getArgument\('controlUrl'\))/;

/** 已有 server 时跳过 health 全表扫描，避免阻塞登录弹窗 */
const QINGTIAN_CONTROL_HEALTH_SCAN_RE =
  /if \(controlUrla\) \{\s*controlUrla = findFirstAvailableHost\(\[controlUrla\]\);\s*\}\s*if \(!controlUrla\) \{\s*controlUrla = findFirstAvailableHost\(host\) \|\| controlUrl;\s*\}/;

const QINGTIAN_FIND_FIRST_HOST_RE =
  /function findFirstAvailableHost\(hosts\) \{[\s\S]*?\n\}\n\nfunction isVips/;

/** 登录脚本内 /health 探测请求超时（毫秒），对齐 requestInScript */
export const READER_LOGIN_HEALTH_PROBE_TIMEOUT_MS = 4000;

export function patchLegadoLoginUrlScript(code: string): string {
  let out = code.replace(CLEAR_DEVICE_FN_RE, (fn) => patchClearDeviceFunction(fn));
  out = patchQingtianLoginScript(out);
  return out;
}

function patchQingtianLoginScript(code: string): string {
  if (!code.includes('controlUrla') || !code.includes("'/control'")) return code;
  let out = code;
  if (QINGTIAN_CONTROL_FN_HEAD_RE.test(out)) {
    out = out.replace(
      QINGTIAN_CONTROL_FN_HEAD_RE,
      `$1var __readerServer = getArgument('server') || (typeof host !== 'undefined' && host && host[0]) || controlUrl;
    $2
    if (!controlUrla || String(controlUrla).replace(/\\/+$/, '') !== String(__readerServer).replace(/\\/+$/, '')) {
        controlUrla = __readerServer;
    }`,
    );
  }
  if (QINGTIAN_CONTROL_HEALTH_SCAN_RE.test(out)) {
    out = out.replace(
      QINGTIAN_CONTROL_HEALTH_SCAN_RE,
      `if (__readerServer && String(__readerServer).indexOf('http') >= 0) {
        controlUrla = String(__readerServer).replace(/\\/+$/, '');
    } else if (controlUrla) {
        controlUrla = findFirstAvailableHost([controlUrla]);
    }
    if (!controlUrla) {
        controlUrla = findFirstAvailableHost(host) || controlUrl;
    }`,
    );
  }
  if (QINGTIAN_FIND_FIRST_HOST_RE.test(out)) {
    out = out.replace(QINGTIAN_FIND_FIRST_HOST_RE, `${READER_FIND_FIRST_AVAILABLE_HOST_BODY}\n\nfunction isVips`);
  }
  return out;
}

/** 限时 /health 扫描：最多 3 个节点、8s 总预算，超时后回退首个候选而不阻塞 UI */
const READER_FIND_FIRST_AVAILABLE_HOST_BODY = `function findFirstAvailableHost(hosts) {
    if (!hosts || !hosts.length) return null;
    var __readerList = hosts.slice();
    try {
        var __readerCur = typeof getArgument === 'function' ? getArgument('server') : '';
        if (__readerCur && String(__readerCur).indexOf('http') >= 0) {
            var __readerNorm = String(__readerCur).replace(/\\/+$/, '');
            for (var __ri = 0; __ri < __readerList.length; __ri++) {
                if (String(__readerList[__ri]).replace(/\\/+$/, '') === __readerNorm) {
                    __readerList = [__readerList[__ri]].concat(__readerList.slice(0, __ri), __readerList.slice(__ri + 1));
                    break;
                }
            }
        }
    } catch (__re) {}
    var __readerDeadline = Date.now() + 8000;
    var __readerMax = Math.min(__readerList.length, 3);
    for (var i = 0; i < __readerMax; i++) {
        if (Date.now() > __readerDeadline) {
            java.longToast('⚠️线路检测超时，使用: ' + __readerList[0]);
            return __readerList[0];
        }
        var host = __readerList[i];
        try {
            java.longToast("🔍 正在检测: " + host);
            var start = new Date().getTime();
            var response = java.ajax(host + "/health");
            var end = new Date().getTime();
            var time = end - start;
            if (String(response).indexOf("晴天") !== -1 && time <= 5000) {
                var status = "✅ 可用";
                if (time < 1000) {
                    status = "💚 优秀";
                } else if (time < 2000) {
                    status = "💛 一般";
                } else {
                    status = "🧡 较慢";
                }
                java.longToast(status + "\\n主机: " + host + "\\n延迟: " + time + "ms");
                return host;
            }
        } catch (e) {}
    }
    if (__readerList.length > 0) {
        java.longToast("❌ 未检测到可用主机，尝试打开: " + __readerList[0]);
        return __readerList[0];
    }
    java.longToast("❌ 没有可用的主机");
    return null;
}`;

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
