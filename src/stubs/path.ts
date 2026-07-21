/**
 * 浏览器 / Vitest 下 path 与 path-browserify 占位（最小实现）。
 */

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export function join(...parts: string[]): string {
  return parts
    .filter((p) => p != null && p !== '')
    .map((p, i) => {
      const n = normalize(String(p));
      if (i === 0) return n.replace(/\/+$/, '');
      return n.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
}

export function dirname(p: string): string {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  if (i <= 0) return i === 0 ? '/' : '.';
  return n.slice(0, i) || '.';
}

export function basename(p: string, ext?: string): string {
  const n = normalize(p);
  const base = n.slice(n.lastIndexOf('/') + 1) || n;
  if (ext && base.endsWith(ext) && base !== ext) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function extname(p: string): string {
  const base = basename(p);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i) : '';
}

export function isAbsolute(p: string): boolean {
  const n = normalize(p);
  return n.startsWith('/') || /^[a-zA-Z]:\//.test(n);
}

export function resolve(...parts: string[]): string {
  let resolved = '';
  for (const part of parts) {
    if (!part) continue;
    const n = normalize(part);
    if (isAbsolute(n)) {
      resolved = n;
    } else {
      resolved = resolved ? join(resolved, n) : n;
    }
  }
  return resolved || '.';
}

const api = { join, dirname, basename, extname, isAbsolute, resolve };
export default api;
