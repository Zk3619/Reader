/**
 * Chrome 扩展风格 URL match patterns
 * @see https://developer.chrome.com/docs/extensions/mv3/match_patterns/
 * 行为对齐 Gopeed pkg/util/matcher.go
 */

export function matchUrlPattern(pattern: string, url: string): boolean {
  if (!pattern || !url) return false;
  const { scheme, host, path } = parsePattern(pattern);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (scheme !== '*' && scheme !== parsed.protocol.replace(/:$/, '')) {
    return false;
  }
  if (!matchHost(host, parsed.hostname)) {
    return false;
  }
  return matchPath(path, parsed.pathname || '/');
}

export function matchAnyUrlPattern(patterns: string[], url: string): boolean {
  return patterns.some((p) => matchUrlPattern(p, url));
}

function parsePattern(pattern: string): { scheme: string; host: string; path: string } {
  const parts = pattern.split('://');
  let scheme = '';
  let rest = pattern;
  if (parts.length === 2) {
    scheme = parts[0]!;
    rest = parts[1]!;
  }
  const slash = rest.split('/');
  const host = slash[0] ?? '';
  const path = slash.length > 1 ? `/${slash.slice(1).join('/')}` : '/';
  return { scheme, host, path };
}

function matchHost(pattern: string, host: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    return host.endsWith(pattern.slice(1));
  }
  return pattern === host;
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern === '*') return true;
  let p = pattern;
  let u = path;
  if (!p.endsWith('*') && !p.endsWith('/')) p += '/';
  if (!u.endsWith('/')) u += '/';
  if (p.includes('*')) {
    const re = new RegExp(`^${p.replace(/\*/g, '.*')}$`);
    return re.test(u);
  }
  return p === u;
}
