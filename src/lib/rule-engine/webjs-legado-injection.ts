/**
 * Legado WebJsExtensions.JS_INJECTION2 兼容层（Promise + java.request）
 */

import { buildWebJsRpcInvokeShim } from '@/lib/rule-engine/webjs-java-rpc';

export function buildLegadoAwaitHelpers(): string {
  return `
function __readerParams(arr) {
  return (arr || []).map(function(p) {
    return p != null && typeof p.toString === 'function' ? p.toString() : null;
  });
}
function __readerRpc(fun) {
  return function() {
    var args = __readerParams(Array.prototype.slice.call(arguments));
    return new Promise(function(resolve, reject) {
      if (!java || !java.request) { reject(new Error('java.request missing')); return; }
      var id = 'req_' + fun + '_' + Date.now();
      if (!window.cache) window.cache = { __m: {}, put: function(k,v){this.__m[k]=v;}, get: function(k){ return this.__m[k]==null?null:this.__m[k]; } };
      var done = false;
      var timer = setTimeout(function() {
        if (done) return;
        done = true;
        reject(new Error('RPC timeout: ' + fun));
      }, 120000);
      window.__READER_JSBridgeResult = function(rid, ok) {
        if (rid !== id || done) return;
        done = true;
        clearTimeout(timer);
        var v = window.cache.get(id);
        if (ok) resolve(v == null ? '' : String(v));
        else reject(new Error(v || 'rpc error'));
      };
      java.request(fun, args, id);
    });
  };
}
var run = __readerRpc('run');
var ajaxAwait = __readerRpc('ajaxAwait');
var connectAwait = __readerRpc('connectAwait');
var getAwait = __readerRpc('getAwait');
var headAwait = __readerRpc('headAwait');
var postAwait = __readerRpc('postAwait');
var webViewAwait = __readerRpc('webViewAwait');
var webViewGetSourceAwait = __readerRpc('webViewGetSourceAwait');
var decryptStrAwait = __readerRpc('decryptStrAwait');
var encryptBase64Await = __readerRpc('encryptBase64Await');
var encryptHexAwait = __readerRpc('encryptHexAwait');
var createSignHexAwait = __readerRpc('createSignHexAwait');
var downloadFileAwait = __readerRpc('downloadFileAwait');
var readTxtFileAwait = __readerRpc('readTxtFileAwait');
var getStringAwait = __readerRpc('getStringAwait');
`.trim();
}

export function buildLegadoWebJsInjection(jsLib?: string): string {
  const shim = buildWebJsRpcInvokeShim();
  const awaits = buildLegadoAwaitHelpers();
  const lib = jsLib?.trim() ? `\n${jsLib}\n` : '';
  return `${shim}\n${awaits}${lib}`;
}
