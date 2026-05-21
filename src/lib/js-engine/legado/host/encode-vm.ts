/**
 * 向 QuickJS 上下文注入 java.base64* / hexDecodeToString（与规则沙箱一致，UTF-8 安全）
 */
import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid } from '@/lib/js-engine/core/runtime';

export function injectLegadoEncodingUtils(vm: QuickJSContext): void {
  evalCodeVoid(vm, `
    var __b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    function __strToUtf8(str) {
      var utf8 = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) utf8.push(c);
        else if (c < 0x800) utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        else if (c >= 0xd800 && c <= 0xdbff) {
          var hi = c, lo = str.charCodeAt(++i);
          var cp = ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
          utf8.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
      return utf8;
    }
    function __utf8ToStr(bytes) {
      var out = '', i = 0;
      while (i < bytes.length) {
        var b = bytes[i++];
        if (b < 0x80) out += String.fromCharCode(b);
        else if ((b & 0xe0) === 0xc0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if ((b & 0xf0) === 0xe0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else if ((b & 0xf8) === 0xf0) {
          var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
          cp -= 0x10000;
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
      }
      return out;
    }
    function __base64Encode(str) {
      if (typeof str !== 'string') str = String(str);
      var bytes = __strToUtf8(str);
      var out = '', i = 0, len = bytes.length, c1, c2, c3;
      while (i < len) {
        c1 = bytes[i++];
        if (i === len) { out += __b64.charAt(c1 >> 2) + __b64.charAt((c1 & 3) << 4) + '=='; break; }
        c2 = bytes[i++];
        if (i === len) { out += __b64.charAt(c1 >> 2) + __b64.charAt(((c1 & 3) << 4) | (c2 >> 4)) + __b64.charAt((c2 & 15) << 2) + '='; break; }
        c3 = bytes[i++];
        out += __b64.charAt(c1 >> 2) + __b64.charAt(((c1 & 3) << 4) | (c2 >> 4)) + __b64.charAt(((c2 & 15) << 2) | (c3 >> 6)) + __b64.charAt(c3 & 63);
      }
      return out;
    }
    function __base64Decode(str) {
      if (typeof str !== 'string') str = String(str);
      var bytes = [], i = 0, len = str.length, a, b, c, d;
      while (i < len) {
        a = __b64.indexOf(str.charAt(i++)); b = __b64.indexOf(str.charAt(i++));
        c = __b64.indexOf(str.charAt(i++)); d = __b64.indexOf(str.charAt(i++));
        bytes.push((a << 2) | (b >> 4));
        if (c < 64) bytes.push(((b & 15) << 4) | (c >> 2));
        if (d < 64) bytes.push(((c & 3) << 6) | d);
      }
      return __utf8ToStr(bytes);
    }
    function __hexDecodeToString(hex) {
      if (typeof hex !== 'string') hex = String(hex);
      var bytes = [];
      for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
      return __utf8ToStr(bytes);
    }
    globalThis.__readerB64Enc = __base64Encode;
    globalThis.__readerB64Dec = __base64Decode;
    globalThis.__readerHexDec = __hexDecodeToString;
  `);
}
