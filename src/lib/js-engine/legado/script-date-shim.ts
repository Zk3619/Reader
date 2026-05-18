/**
 * 书源脚本中 java.ajax 在 Web 端通过挂起/缓存模拟同步返回，重跑时
 * `end - start`（Date.now / getTime）会为 ~0。在 ajax 返回时注入真实耗时，
 * 使紧随其后的第一次 getTime/now 增加对应毫秒，兼容 Legado 测延迟写法。
 */

export type ScriptDateShim = {
  PatchedDate: DateConstructor;
  applyAjaxDuration: (durationMs: number) => void;
};

export function installScriptDateShim(): ScriptDateShim {
  const RealDate = Date;
  const origGetTime = RealDate.prototype.getTime;

  let postAjaxBoostMs = 0;
  let consumedPostAjaxBoost = false;

  function applyAjaxDuration(durationMs: number) {
    if (durationMs > 0) {
      postAjaxBoostMs = durationMs;
      consumedPostAjaxBoost = false;
    }
  }

  function consumeBoost(t: number): number {
    if (postAjaxBoostMs > 0 && !consumedPostAjaxBoost) {
      consumedPostAjaxBoost = true;
      const boosted = t + postAjaxBoostMs;
      postAjaxBoostMs = 0;
      return boosted;
    }
    return t;
  }

  function PatchedDate(this: unknown, ...args: unknown[]) {
    const d =
      args.length === 0
        ? new RealDate()
        : new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
    Object.setPrototypeOf(d, PatchedDate.prototype);
    return d;
  }

  PatchedDate.now = () => consumeBoost(RealDate.now());
  PatchedDate.parse = RealDate.parse.bind(RealDate);
  PatchedDate.UTC = RealDate.UTC.bind(RealDate);

  PatchedDate.prototype = Object.create(RealDate.prototype);
  PatchedDate.prototype.constructor = PatchedDate;
  PatchedDate.prototype.getTime = function (this: Date) {
    return consumeBoost(origGetTime.call(this));
  };

  return {
    PatchedDate: PatchedDate as unknown as DateConstructor,
    applyAjaxDuration,
  };
}
