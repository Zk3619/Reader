/**
 * Minimal JSInterpreter — yt-dlp jsinterp subset for string transforms / nsig-like helpers.
 * Executes via `new Function` in a sealed local scope (no DOM / no import).
 */

/** Converts an integer to a signed 32-bit integer (yt-dlp jsinterp.int_to_int32). */
export function int_to_int32(n: number): number {
  const x = n >>> 0;
  return x & 0x80000000 ? x - 0x100000000 : x;
}

/**
 * JS Number.prototype.toString(radix) subset — yt-dlp js_number_to_string.
 * Used by xhamster / twitter / VK style player helpers.
 */
export function js_number_to_string(val: number, radix = 10): string {
  let r = radix;
  if (r == null || Number.isNaN(r)) r = 10;
  if (r < 2 || r > 36 || !Number.isInteger(r)) {
    throw new RangeError('radix must be an integer at least 2 and no greater than 36');
  }
  if (Number.isNaN(val)) return 'NaN';
  if (val === 0) return '0';
  if (!Number.isFinite(val)) return val < 0 ? '-Infinity' : 'Infinity';
  if (r === 10) return String(val);

  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const sign = val < 0;
  let v = Math.abs(val);
  let integer = Math.trunc(v);
  let fraction = v - integer;
  // Approximate ulp/2 for rounding loop (ES5 ToString radix)
  let delta = Math.max(Number.EPSILON, Number.MIN_VALUE);
  try {
    // Prefer true ulp when available
    const ulp = (Number as unknown as { EPSILON: number }).EPSILON;
    delta = Math.max(Number.MIN_VALUE, (ulp || Number.EPSILON) * Math.max(1, v) / 2);
  } catch {
    /* keep */
  }

  const digits: number[] = [];
  if (fraction >= delta) {
    // marker for '.'
    digits.push(-2);
  }
  while (fraction >= delta) {
    delta *= r;
    fraction *= r;
    const digit = Math.trunc(fraction);
    fraction -= digit;
    digits.push(digit);
    const needsRounding = fraction > 0.5 || (fraction === 0.5 && (digit & 1) === 1);
    if (needsRounding && fraction + delta > 1) {
      for (let index = digits.length - 1; index >= 1; index--) {
        if (digits[index]! + 1 < r) {
          digits[index]! += 1;
          break;
        }
        digits.pop();
      }
      if (digits.length <= 1 || digits[digits.length - 1] === -2) {
        integer += 1;
      }
      break;
    }
  }

  const intDigits: number[] = [];
  let n = integer;
  intDigits.push(n % r);
  n = Math.floor(n / r);
  while (n > 0) {
    intDigits.unshift(n % r);
    n = Math.floor(n / r);
  }

  const all = [...intDigits, ...digits];
  let out = '';
  if (sign) out += '-';
  for (const d of all) {
    if (d === -2) out += '.';
    else out += alphabet[d] ?? '';
  }
  return out || '0';
}

export class JSInterpreterError extends Error {
  constructor(message: string, opts?: { cause?: unknown }) {
    super(message);
    this.name = 'JSInterpreterError';
    if (opts?.cause) (this as Error & { cause?: unknown }).cause = opts.cause;
  }
}

export class JSInterpreter {
  code: string;
  private _objects = new Map<string, unknown>();

  constructor(code: string) {
    this.code = String(code || '');
  }

  /** Extract named function body range (best-effort brace match). */
  extractFunctionCode(funcName: string): { args: string[]; code: string } | null {
    const name = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(?:function\\s+${name}\\s*|` +
        `(?:var|let|const)\\s+${name}\\s*=\\s*function\\s*|` +
        `${name}\\s*=\\s*function\\s*)` +
        `\\(([^)]*)\\)\\s*\\{`,
    );
    const m = this.code.match(re);
    if (!m || m.index == null) return null;
    const args = m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
    const start = this.code.indexOf('{', m.index);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < this.code.length; i++) {
      const ch = this.code[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return { args, code: this.code.slice(start + 1, i) };
        }
      }
    }
    return null;
  }

  callFunction(funcName: string, ...args: unknown[]): unknown {
    const extracted = this.extractFunctionCode(funcName);
    if (!extracted) {
      throw new JSInterpreterError(`Function ${funcName} not found`);
    }
    return this.interpretFunction(extracted.code, extracted.args, args);
  }

  interpretFunction(code: string, argNames: string[], argValues: unknown[]): unknown {
    const names = argNames.length ? argNames : argValues.map((_, i) => `a${i}`);
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...names, `"use strict";\n${code}`);
      return fn(...argValues);
    } catch (e) {
      throw new JSInterpreterError(`interpret failed: ${(e as Error).message}`, { cause: e });
    }
  }

  /** Eval expression against optional locals (for one-liners). */
  evaluate(expr: string, locals: Record<string, unknown> = {}): unknown {
    const keys = Object.keys(locals);
    const vals = keys.map((k) => locals[k]);
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...keys, `"use strict"; return (${expr});`);
      return fn(...vals);
    } catch (e) {
      throw new JSInterpreterError(`evaluate failed: ${(e as Error).message}`, { cause: e });
    }
  }

  setObject(name: string, value: unknown): void {
    this._objects.set(name, value);
  }

  getObject(name: string): unknown {
    return this._objects.get(name);
  }
}

/** Convenience: run named function from player JS source. */
export function callJsFunction(
  playerJs: string,
  funcName: string,
  ...args: unknown[]
): unknown {
  return new JSInterpreter(playerJs).callFunction(funcName, ...args);
}
