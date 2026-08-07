/**
 * Minimal JSInterpreter — yt-dlp jsinterp subset for string transforms / nsig-like helpers.
 * Executes via `new Function` in a sealed local scope (no DOM / no import).
 */

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
