/**
 * Legado/Rhino 环境占位（晴天聚合等书源 loginUrl/jsLib 依赖）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid } from '@/lib/js-engine/core/runtime';

/** 注入 Packages、cache、java.createSymmetricCrypto 等（须在书源脚本 eval 之前调用） */
export function injectRhinoLegadoShims(vm: QuickJSContext): void {
  evalCodeVoid(
    vm,
    `
    (function() {
      if (typeof globalThis.Packages === 'undefined') {
        globalThis.Packages = {
          java: {
            lang: {
              Thread: {
                sleep: function(ms) { /* Web 端无法同步阻塞，忽略 */ }
              }
            }
          },
          android: {
            util: {
              Base64: {
                encodeToString: function(data, flags) {
                  if (data == null) return '';
                  if (typeof data === 'string') return globalThis.__readerB64Enc(data);
                  var s = '', i, n = data.length;
                  for (i = 0; i < n; i++) s += String.fromCharCode(data[i] & 0xff);
                  return globalThis.__readerB64Enc(s);
                }
              }
            }
          },
          io: {
            legato: {
              kazusa: {
                utils: {
                  TimeoutCancellationException: function(msg) {
                    this.message = msg || '';
                    this.name = 'TimeoutCancellationException';
                  }
                }
              }
            }
          }
        };
      }
      globalThis.__readerCacheStore = globalThis.__readerCacheStore || {};
      if (typeof globalThis.cache === 'undefined') {
        globalThis.cache = {
          put: function(k, v) { globalThis.__readerCacheStore[String(k)] = v; },
          get: function(k) {
            var v = globalThis.__readerCacheStore[String(k)];
            return v === undefined ? null : v;
          },
          remove: function(k) { delete globalThis.__readerCacheStore[String(k)]; },
          putMemory: function(k, v) { globalThis.__readerCacheStore[String(k)] = v; },
          getFromMemory: function(k) {
            var v = globalThis.__readerCacheStore[String(k)];
            return v === undefined ? 0 : v;
          }
        };
      }
      if (!globalThis.java) globalThis.java = {};
      if (typeof globalThis.java.createSymmetricCrypto !== 'function') {
        globalThis.java.createSymmetricCrypto = function(alg, key) {
          return {
            encrypt: function(info) {
              return String(info == null ? '' : info);
            },
            decryptStr: function(data) {
              return String(data == null ? '' : data);
            },
            encryptBase64: function(data) {
              return globalThis.__readerB64Enc(String(data == null ? '' : data));
            },
            encryptHex: function(data) {
              return String(data == null ? '' : data);
            }
          };
        };
      }
      if (typeof globalThis.java.base64Encode !== 'function') {
        globalThis.java.base64Encode = function(s) {
          return globalThis.__readerB64Enc(String(s == null ? '' : s));
        };
      }
      if (typeof globalThis.java.base64Decode !== 'function') {
        globalThis.java.base64Decode = function(s) {
          return globalThis.__readerB64Dec(String(s == null ? '' : s));
        };
      }
      if (typeof globalThis.java.digestHex !== 'function') {
        globalThis.java.digestHex = function(alg, input) {
          return String(input == null ? '' : input);
        };
      }
      if (typeof globalThis.java.hexDecodeToString !== 'function') {
        globalThis.java.hexDecodeToString = function(hex) {
          return String(hex == null ? '' : hex);
        };
      }
      if (typeof globalThis.java.longToast !== 'function') {
        globalThis.java.longToast = function(msg) {
          console.log('[longToast]', msg);
        };
      }
      if (typeof globalThis.java.zip !== 'function') {
        globalThis.java.zip = function(path) {
          return '';
        };
      }
      if (typeof globalThis.java.unzip !== 'function') {
        globalThis.java.unzip = function(path) {
          return '';
        };
      }
    })();
  `
  );
}
