/** Minimal path stub for vendored bangumi-data-util */
function normalize(p) {
  return String(p).replace(/\\/g, '/');
}

export function join(...parts) {
  return parts
    .filter((p) => p != null && p !== '')
    .map((p, i) => {
      const n = normalize(p);
      if (i === 0) return n.replace(/\/+$/, '');
      return n.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
}

export function dirname(p) {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  if (i <= 0) return i === 0 ? '/' : '.';
  return n.slice(0, i) || '.';
}

export function basename(p, ext) {
  const n = normalize(p);
  const base = n.slice(n.lastIndexOf('/') + 1) || n;
  if (ext && base.endsWith(ext) && base !== ext) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function resolve(...parts) {
  let resolved = '';
  for (const part of parts) {
    if (!part) continue;
    const n = normalize(part);
    if (n.startsWith('/') || /^[a-zA-Z]:\//.test(n)) {
      resolved = n;
    } else {
      resolved = resolved ? join(resolved, n) : n;
    }
  }
  return resolved || '.';
}

const api = { join, dirname, basename, resolve };
export default api;
