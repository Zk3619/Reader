/**
 * traverse_obj deepen + require/value/subs helpers — yt-dlp utils/traversal.py subset.
 */

import { try_call, variadic } from './extras';

export const TRAVERSE_NO_DEFAULT = Symbol('no_default');

export { variadic };

export function value<T>(v: T): T {
  return v;
}

export function require(name: string, expectedType?: (v: unknown) => unknown) {
  return (v: unknown) => {
    if (v == null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)) {
      throw new Error(`Unable to extract ${name}`);
    }
    if (expectedType) {
      try {
        const out = expectedType(v);
        if (out == null) throw new Error(`Unable to extract ${name}`);
        return out;
      } catch (e) {
        throw new Error(`Unable to extract ${name}: ${(e as Error).message}`);
      }
    }
    return v;
  };
}

export function filter_truthy(v: unknown): unknown {
  return v ? v : undefined;
}

export function subs_list_to_dict(
  subs: Array<{ url?: string; ext?: string; lang?: string; name?: string } | null | undefined> | null | undefined,
  langKey = 'lang',
): Record<string, Array<{ url?: string; ext?: string; name?: string }>> {
  const out: Record<string, Array<{ url?: string; ext?: string; name?: string }>> = {};
  if (!subs) return out;
  for (const s of subs) {
    if (!s) continue;
    const lang = String((s as Record<string, unknown>)[langKey] || s.lang || 'und');
    if (!out[lang]) out[lang] = [];
    out[lang]!.push({ url: s.url, ext: s.ext, name: s.name });
  }
  return out;
}

export type DeepTraversePath =
  | string
  | number
  | null
  | undefined
  | RegExp
  | ((k: unknown, v?: unknown) => unknown)
  | DeepTraversePath[]
  | { [k: string]: DeepTraversePath }
  | typeof Array
  | typeof Object
  | typeof String
  | typeof Number
  | typeof Boolean
  | '...'
  | { __type?: 'any' | 'all' | 'filter' | 'slice'; start?: number; end?: number; step?: number };

/**
 * Deepened traverse_obj — supports ..., type sets, dict transform, any/all/filter, branching.
 * Keeps compatibility with utils/index traverse_obj for simple paths.
 */
export function traverse_obj_deep(
  obj: unknown,
  ...pathArgs: unknown[]
): unknown {
  // Signature overload: (obj, path, opts) OR (obj, ...paths, opts?)
  let defaultValue: unknown = TRAVERSE_NO_DEFAULT;
  let expectedType: ((v: unknown) => unknown) | undefined;
  let getAll = true;
  let casesense = true;

  let paths: unknown[] = pathArgs;
  const last = pathArgs[pathArgs.length - 1];
  if (
    last &&
    typeof last === 'object' &&
    !Array.isArray(last) &&
    !(last instanceof RegExp) &&
    ('default' in (last as object) ||
      'expected_type' in (last as object) ||
      'get_all' in (last as object) ||
      'casesense' in (last as object))
  ) {
    const opts = last as {
      default?: unknown;
      expected_type?: (v: unknown) => unknown;
      get_all?: boolean;
      casesense?: boolean;
    };
    paths = pathArgs.slice(0, -1);
    if ('default' in opts) defaultValue = opts.default;
    expectedType = opts.expected_type;
    if (opts.get_all != null) getAll = opts.get_all;
    if (opts.casesense != null) casesense = opts.casesense;
  }

  if (!paths.length) paths = [null];

  for (const rawPath of paths) {
    const branches = applyPath(obj, variadic(rawPath as DeepTraversePath), { casesense });
    const filtered = branches
      .map((v) => applyType(v, expectedType))
      .filter((v) => v !== undefined && v !== null && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0));

    if (!filtered.length) continue;
    if (!getAll) return filtered[0];
    return filtered.length === 1 ? filtered[0] : filtered;
  }

  if (defaultValue !== TRAVERSE_NO_DEFAULT) return defaultValue;
  return getAll ? [] : undefined;
}

function applyType(v: unknown, expected?: (x: unknown) => unknown): unknown {
  if (!expected) return v;
  try {
    return expected(v);
  } catch {
    return undefined;
  }
}

function applyPath(
  obj: unknown,
  path: DeepTraversePath[],
  opts: { casesense: boolean },
): unknown[] {
  let cursors: unknown[] = [obj];
  for (const key of path) {
    const next: unknown[] = [];
    for (const cur of cursors) {
      next.push(...step(cur, key, opts));
    }
    cursors = next;
    if (!cursors.length) break;
  }
  return cursors;
}

function step(obj: unknown, key: DeepTraversePath, opts: { casesense: boolean }): unknown[] {
  if (key == null) return obj === undefined ? [] : [obj];

  // builtins as markers
  if (key === Array || (typeof key === 'function' && (key as Function).name === 'any')) {
    /* handled below via string markers */
  }

  if (key === '...' || (key as { __type?: string })?.__type === 'all') {
    if (Array.isArray(obj)) return [...obj];
    if (obj && typeof obj === 'object') return Object.values(obj as object);
    return [];
  }

  if (typeof key === 'number') {
    if (!Array.isArray(obj)) return [];
    const v = obj[key];
    return v === undefined ? [] : [v];
  }

  if (typeof key === 'string') {
    if (Array.isArray(obj)) {
      return obj
        .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined))
        .filter((v) => v !== undefined);
    }
    if (obj && typeof obj === 'object') {
      const rec = obj as Record<string, unknown>;
      if (!opts.casesense) {
        const found = Object.keys(rec).find((k) => k.toLowerCase() === key.toLowerCase());
        return found != null && rec[found] !== undefined ? [rec[found]] : [];
      }
      return rec[key] !== undefined ? [rec[key]] : [];
    }
    return [];
  }

  if (key instanceof RegExp) {
    if (Array.isArray(obj)) return obj.filter((x) => key.test(String(x)));
    if (obj && typeof obj === 'object') {
      return Object.entries(obj as object)
        .filter(([k]) => key.test(k))
        .map(([, v]) => v);
    }
    return [];
  }

  // type filter set: simulate with function that is a constructor
  if (typeof key === 'function') {
    // filter function (key, value) OR type constructor
    if ([String, Number, Boolean, Array, Object].includes(key as never)) {
      const ok =
        (key === String && typeof obj === 'string') ||
        (key === Number && typeof obj === 'number') ||
        (key === Boolean && typeof obj === 'boolean') ||
        (key === Array && Array.isArray(obj)) ||
        (key === Object && obj != null && typeof obj === 'object' && !Array.isArray(obj));
      return ok ? [obj] : [];
    }
    try {
      if (Array.isArray(obj)) {
        return obj.filter((v, i) => {
          try {
            return !!(key as (a: unknown, b: unknown) => unknown)(i, v);
          } catch {
            return false;
          }
        });
      }
      if (obj && typeof obj === 'object') {
        return Object.entries(obj as object)
          .filter(([k, v]) => {
            try {
              return !!(key as (a: unknown, b: unknown) => unknown)(k, v);
            } catch {
              return false;
            }
          })
          .map(([, v]) => v);
      }
      const out = (key as (a: unknown) => unknown)(obj);
      return out === undefined ? [] : [out];
    } catch {
      return [];
    }
  }

  if (Array.isArray(key)) {
    // branch: collect results for each subpath
    const out: unknown[] = [];
    for (const branch of key) {
      out.push(...applyPath(obj, variadic(branch), opts));
    }
    return out;
  }

  if (typeof key === 'object' && key && !Array.isArray(key)) {
    const k = key as Record<string, unknown>;
    if (k.__type === 'any' || 'any' in k) {
      const paths = variadic((k.any ?? k) as DeepTraversePath);
      for (const p of paths) {
        const got = applyPath(obj, variadic(p), opts);
        if (got.length) return [got[0]];
      }
      return [];
    }
    if (k.__type === 'filter') {
      return obj ? [obj] : [];
    }
    if (k.__type === 'slice') {
      if (!Array.isArray(obj)) return [];
      return obj.slice(k.start as number, k.end as number);
    }
    // dict transform
    const out: Record<string, unknown> = {};
    for (const [dk, dv] of Object.entries(k)) {
      if (dk.startsWith('__')) continue;
      const got = applyPath(obj, variadic(dv as DeepTraversePath), opts);
      if (got.length) out[dk] = got.length === 1 ? got[0] : got;
    }
    return Object.keys(out).length ? [out] : [];
  }

  return [];
}

export function find_element(opts: {
  tag?: string;
  id?: string;
  class?: string;
  attribute?: string;
  value?: string;
  html: string;
}): string | null {
  const html = opts.html || '';
  if (opts.id) {
    const re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*\\bid=["']${escapeRe(opts.id)}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      'i',
    );
    const m = re.exec(html);
    return m?.[3] != null ? m[3] : null;
  }
  if (opts.class) {
    const re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*\\bclass=["'][^"']*\\b${escapeRe(opts.class)}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      'i',
    );
    const m = re.exec(html);
    return m?.[3] != null ? m[3] : null;
  }
  if (opts.attribute && opts.value) {
    const re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*\\b${escapeRe(opts.attribute)}=["']${escapeRe(opts.value)}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      'i',
    );
    const m = re.exec(html);
    return m?.[3] != null ? m[3] : null;
  }
  if (opts.tag) {
    const re = new RegExp(`<${escapeRe(opts.tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRe(opts.tag)}>`, 'i');
    const m = re.exec(html);
    return m?.[1] ?? null;
  }
  return null;
}

export function find_elements(opts: {
  tag?: string;
  class?: string;
  attribute?: string;
  value?: string;
  html: string;
}): string[] {
  const html = opts.html || '';
  const out: string[] = [];
  let re: RegExp | null = null;
  if (opts.class) {
    re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*\\bclass=["'][^"']*\\b${escapeRe(opts.class)}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      'gi',
    );
  } else if (opts.attribute && opts.value) {
    re = new RegExp(
      `<([a-zA-Z0-9]+)([^>]*\\b${escapeRe(opts.attribute)}=["']${escapeRe(opts.value)}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
      'gi',
    );
  } else if (opts.tag) {
    re = new RegExp(
      `<${escapeRe(opts.tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRe(opts.tag)}>`,
      'gi',
    );
  }
  if (!re) return out;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(m[3] ?? m[1] ?? '');
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** XPath-ish: find text of first matching local-name element (namespace-agnostic). */
export function xpath_text(
  xml: string,
  path: string,
  _name?: string,
  fatal = false,
  defaultValue: string | null = null,
): string | null {
  const parts = path.replace(/^\.\/+/, '').split('/').filter(Boolean);
  const local = parts[parts.length - 1]?.replace(/^.*:/, '') || '';
  if (!local) return defaultValue;
  const re = new RegExp(`<${escapeRe(local)}\\b[^>]*>([\\s\\S]*?)</${escapeRe(local)}>`, 'i');
  const m = re.exec(xml);
  if (!m) {
    if (fatal) throw new Error(`Unable to extract xpath ${path}`);
    return defaultValue;
  }
  return (m[1] || '').replace(/<[^>]+>/g, '').trim() || defaultValue;
}

export function xpath_element(xml: string, path: string): string | null {
  const parts = path.replace(/^\.\/+/, '').split('/').filter(Boolean);
  const local = parts[parts.length - 1]?.replace(/^.*:/, '') || '';
  if (!local) return null;
  const re = new RegExp(`(<${escapeRe(local)}\\b[^>]*>[\\s\\S]*?</${escapeRe(local)}>)`, 'i');
  return re.exec(xml)?.[1] ?? null;
}

export function find_xpath_attr(xml: string, tag: string, attr: string, value: string): string | null {
  const re = new RegExp(
    `<${escapeRe(tag)}\\b[^>]*\\b${escapeRe(attr)}=["']${escapeRe(value)}["'][^>]*>([\\s\\S]*?)</${escapeRe(tag)}>`,
    'i',
  );
  return re.exec(xml)?.[1] ?? null;
}

export function get_element_html_by_id(id: string, html: string): string | null {
  const re = new RegExp(
    `(<[a-zA-Z0-9]+[^>]*\\bid=["']${escapeRe(id)}["'][^>]*>[\\s\\S]*?<\\/[a-zA-Z0-9]+>)`,
    'i',
  );
  return re.exec(html)?.[1] ?? null;
}

export function get_element_html_by_class(cls: string, html: string): string | null {
  const re = new RegExp(
    `(<[a-zA-Z0-9]+[^>]*\\bclass=["'][^"']*\\b${escapeRe(cls)}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/[a-zA-Z0-9]+>)`,
    'i',
  );
  return re.exec(html)?.[1] ?? null;
}

export function get_elements_html_by_class(cls: string, html: string): string[] {
  const re = new RegExp(
    `(<[a-zA-Z0-9]+[^>]*\\bclass=["'][^"']*\\b${escapeRe(cls)}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/[a-zA-Z0-9]+>)`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]!);
  return out;
}

export { try_call };
