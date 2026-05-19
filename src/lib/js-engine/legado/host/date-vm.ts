/**
 * 在 QuickJS 内注入测延迟用的 Date 修正（与 script-date-shim 行为一致）
 */
import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid } from '../../core/runtime';

export function injectDateShimVm(vm: QuickJSContext): {
  applyAjaxDuration: (durationMs: number) => void;
} {
  evalCodeVoid(vm, `
    globalThis.__readerPostAjaxBoostMs = 0;
    globalThis.__readerConsumedBoost = false;
    globalThis.__readerApplyAjaxDuration = function(ms) {
      if (ms > 0) {
        globalThis.__readerPostAjaxBoostMs = ms;
        globalThis.__readerConsumedBoost = false;
      }
    };
    (function() {
      var RealDate = Date;
      var origGetTime = RealDate.prototype.getTime;
      function consumeBoost(t) {
        if (globalThis.__readerPostAjaxBoostMs > 0 && !globalThis.__readerConsumedBoost) {
          globalThis.__readerConsumedBoost = true;
          var boosted = t + globalThis.__readerPostAjaxBoostMs;
          globalThis.__readerPostAjaxBoostMs = 0;
          return boosted;
        }
        return t;
      }
      function PatchedDate() {
        var d = arguments.length === 0 ? new RealDate() : new (Function.prototype.bind.apply(RealDate, [null].concat(Array.prototype.slice.call(arguments))))();
        Object.setPrototypeOf(d, PatchedDate.prototype);
        return d;
      }
      PatchedDate.now = function() { return consumeBoost(RealDate.now()); };
      PatchedDate.parse = RealDate.parse.bind(RealDate);
      PatchedDate.UTC = RealDate.UTC.bind(RealDate);
      PatchedDate.prototype = Object.create(RealDate.prototype);
      PatchedDate.prototype.constructor = PatchedDate;
      PatchedDate.prototype.getTime = function() { return consumeBoost(origGetTime.call(this)); };
      globalThis.Date = PatchedDate;
    })();
  `);

  return {
    applyAjaxDuration(durationMs: number) {
      evalCodeVoid(vm, `globalThis.__readerApplyAjaxDuration(${Number(durationMs)});`);
    },
  };
}
