/**
 * 发现脚本 java 设备 API（对齐 Legado / rule-script-runner）
 * 晴天聚合 exploreUrl 用 qread → deviceID → androidId 链判断 device_type。
 */

import { legadoJavaAndroidId, legadoJavaDeviceID } from '@/lib/book-source/source-http';
import type { BookSource } from '@/types';

/** 非轻阅读环境：qread 须失败以便走后续 deviceID/androidId 分支 */
export function legadoExploreJavaQread(): void {
  throw new Error('qread unavailable');
}

/**
 * 发现脚本须在 VM 内用纯 JS 定义 qread/deviceID（QuickJS 宿主 bind 抛错无法被书源内层 catch 捕获）。
 * 每次 eval 脚本 bundle 开头 / two-pass 重跑前执行。
 */
export const LEGADO_EXPLORE_DEVICE_JAVA_SHIM = `
(function __readerExploreDeviceJavaShim() {
  var j = globalThis.java;
  if (!j) return;
  j.qread = function __readerJavaQread() {
    throw new Error('qread unavailable');
  };
  j.deviceID = function __readerJavaDeviceID() {
    throw new Error('java.deviceID is not available on this platform');
  };
})();
`.trim();

/**
 * Reader/Web：qread 失败后优先 androidId（Android 改包路径），避免 deviceID 宿主静默返回误判为苹果。
 */
export const LEGADO_EXPLORE_DEVICE_TYPE_PROBE = `
let device_type = (function __readerExploreDeviceTypeProbe() {
  var j = globalThis.java;
  if (!j) return '安卓';
  try { j.qread(); return '轻阅读'; } catch (e1) {}
  if (typeof j.androidId === 'function') {
    try {
      var aid = String(j.androidId());
      if (aid && aid !== 'undefined' && aid !== 'null') return '安卓';
    } catch (e2) {}
  }
  try { j.deviceID(); return '苹果'; } catch (e3) { return '安卓'; }
})();
`.trim();

/** qtsj createFilter 门禁前：再次修正 device_type / islyc 并写调试信息 */
export const LEGADO_EXPLORE_QTSJ_GATE_PRELUDE = `
(function __readerEnsureQtsjGateEnv() {
  var j = globalThis.java;
  if (j) {
    j.qread = function __readerJavaQread() {
      throw new Error('qread unavailable');
    };
    j.deviceID = function __readerJavaDeviceID() {
      throw new Error('java.deviceID is not available on this platform');
    };
    try { j.qread(); device_type = '轻阅读'; return; } catch (e1) {}
    if (typeof j.androidId === 'function') {
      try {
        var aid = String(j.androidId());
        if (aid && aid !== 'undefined' && aid !== 'null') {
          device_type = '安卓';
        }
      } catch (e2) {}
    }
    if (device_type === '苹果') {
      try { j.deviceID(); device_type = '苹果'; } catch (e3) { device_type = '安卓'; }
    }
  }
  if (!islyc) {
    try {
      new Packages.io.legato.kazusa.utils.TimeoutCancellationException('');
      islyc = true;
    } catch (e4) {
      if (typeof source === 'undefined' || typeof source.loginUi !== 'function') {
        islyc = true;
      }
    }
  }
  var gate = ((islyc && device_type != '苹果') || device_type == '轻阅读') && fxyjr != 'on' && fxyjr != "on";
  globalThis.__readerExploreGateDebug = {
    islyc: islyc,
    device_type: device_type,
    fxyjr: fxyjr,
    gate: gate,
    hasJava: !!j,
    hasAndroidId: !!(j && j.androidId)
  };
  if (typeof java !== 'undefined' && java && typeof java.log === 'function') {
    try { java.log('[reader-gate]', JSON.stringify(globalThis.__readerExploreGateDebug)); } catch (e5) {}
  }
})();
`.trim();

/** 晴天聚合等：java.qread → deviceID → androidId 探测块 */
const EXPLORE_DEVICE_TYPE_BLOCK_RE =
  /let device_type\s*=\s*'安卓'\s*;\s*try\s*\{[\s\S]*?java\.qread\(\)[\s\S]*?\}\s*catch\s*\(\s*e\s*\)\s*\{[\s\S]*?java\.androidId\(\)[\s\S]*?\}\s*\}/;

/** createFilter 门禁 if（晴天聚合 qtsj 块） */
const EXPLORE_QTSJ_GATE_IF_RE =
  /if\s*\(\(\(islyc\s*&&\s*device_type\s*!=\s*'苹果'\)\s*\|\|\s*device_type\s*==\s*'轻阅读'\)\s*&&\s*fxyjr\s*!=\s*"on"\)\s*\{/;

export function patchExploreScriptDeviceTypeProbe(script: string): string {
  if (!/java\.qread\(\)/.test(script) || !/let device_type/.test(script)) {
    return script;
  }
  if (EXPLORE_DEVICE_TYPE_BLOCK_RE.test(script)) {
    return script.replace(EXPLORE_DEVICE_TYPE_BLOCK_RE, LEGADO_EXPLORE_DEVICE_TYPE_PROBE);
  }
  return script.replace(
    /let device_type\s*=\s*'安卓'\s*;/,
    `${LEGADO_EXPLORE_DEVICE_JAVA_SHIM}\n${LEGADO_EXPLORE_DEVICE_TYPE_PROBE}`,
  );
}

export function patchExploreScriptQtsjGatePrelude(script: string): string {
  if (!EXPLORE_QTSJ_GATE_IF_RE.test(script)) return script;
  return script.replace(
    EXPLORE_QTSJ_GATE_IF_RE,
    `${LEGADO_EXPLORE_QTSJ_GATE_PRELUDE}\nif (((islyc&&device_type!='苹果') || device_type=='轻阅读') && fxyjr !="on") {`,
  );
}

/** 光遇聚合等：云端 discovestyle 不含搜索行，在 qtsj 合并前补搜索框+按钮（对齐 Legado 26.6+） */
export const LEGADO_GYKS_EXPLORE_SEARCH_ROW_PATCH = `
(function __readerGyksInjectSearchRow() {
  if (typeof qtsj === 'undefined' || !qtsj || !qtsj.push) return;
  for (var i = 0; i < qtsj.length; i++) {
    var it = qtsj[i];
    if (!it) continue;
    if (it.type === 'text') return;
    if (it.title && String(it.title).indexOf('搜索') >= 0) return;
  }
  var searchText = {
    title: '搜索书名或作者',
    type: 'text',
    style: { layout_flexGrow: 1, layout_flexBasisPercent: 0.66 }
  };
  var searchBtn = {
    title: '搜索',
    type: 'button',
    action: "java.openBookSearch(infoMap['搜索书名或作者'])",
    style: { layout_flexGrow: 1, layout_flexBasisPercent: 0.34 }
  };
  var insertAt = qtsj.length;
  for (var j = 0; j < qtsj.length; j++) {
    if (qtsj[j] && qtsj[j].title === '书源设置') {
      insertAt = j + 1;
      break;
    }
  }
  qtsj.splice(insertAt, 0, searchText, searchBtn);
})();
`.trim();

const GYKS_DISCOVERSTYLE_MARKER = /discovestyle\?source=/;

export function patchExploreScriptGyksSearchRow(script: string): string {
  if (!GYKS_DISCOVERSTYLE_MARKER.test(script) || !/let qtsj\s*=/.test(script)) {
    return script;
  }
  const marker = 'var finalData = infoData.concat(groupDatas, style_list);';
  if (!script.includes(marker)) return script;
  if (script.includes('__readerGyksInjectSearchRow')) return script;
  return script.replace(marker, `${LEGADO_GYKS_EXPLORE_SEARCH_ROW_PATCH}\n${marker}`);
}

export function patchExploreScriptForReaderWeb(script: string): string {
  return patchExploreScriptGyksSearchRow(
    patchExploreScriptQtsjGatePrelude(patchExploreScriptDeviceTypeProbe(script)),
  );
}

export function createLegadoExploreJavaDeviceHandlers(source?: BookSource) {
  return {
    androidId: () => legadoJavaAndroidId(source),
    deviceID: () => legadoJavaDeviceID(),
    qread: () => legadoExploreJavaQread(),
  };
}

/** 与晴天 exploreUrl 脚本一致的 device_type 探测（用于回归测试） */
export function detectLegadoExploreDeviceType(java: {
  qread: () => void;
  deviceID: () => unknown;
  androidId: () => string;
}): string {
  let device_type = '安卓';
  try {
    try {
      java.qread();
      device_type = '轻阅读';
    } catch {
      java.deviceID();
      device_type = '苹果';
    }
  } catch {
    try {
      java.androidId();
      device_type = '安卓';
    } catch {
      device_type = '安卓';
    }
  }
  return device_type;
}

/** Reader/Web：androidId 可用即视为安卓（QuickJS deviceID 不可靠） */
export function detectLegadoExploreDeviceTypeAndroidFirst(java: {
  qread: () => void;
  deviceID: () => unknown;
  androidId: () => string;
}): string {
  try {
    java.qread();
    return '轻阅读';
  } catch {
    /* continue */
  }
  try {
    const aid = String(java.androidId());
    if (aid && aid !== 'undefined' && aid !== 'null') return '安卓';
  } catch {
    /* continue */
  }
  try {
    java.deviceID();
    return '苹果';
  } catch {
    return '安卓';
  }
}
