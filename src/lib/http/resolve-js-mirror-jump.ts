/**
 * 解析七猫等站点的 JS 镜像跳转页（Jump3url + setTimeout location.href=url3+urlt）
 */

const JUMP_MARKER = /Jump3url\s+Start/i;
const JUMP_REDIRECT = /window\.location\.href\s*=\s*url3\s*\+\s*urlt/i;
const EVAL_DECODE = /eval\s*\(\s*decodeURIComponent\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/i;
const URL2_PUSH = /url2\s*\.\s*push\s*\(\s*["']([^"']+)["']\s*\)/gi;
const USE_PROTOCOL = /var\s+UseProtocol\s*=\s*["']([^"']+)["']/i;
const USE_DAY = /var\s+UseDay\s*=\s*(\d+)/i;
const OFFSET_HOUR = /var\s+OffsetHour\s*=\s*(\d+)/i;

/** 是否为 JS 镜像跳转占位页（非 WebView 直拉常见） */
export function isJsMirrorJumpPage(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed || trimmed.length > 12_000) return false;
  return JUMP_MARKER.test(trimmed) && JUMP_REDIRECT.test(trimmed);
}

/** 跳转页解析出的镜像 URL（按优先级，含随机域展开） */
export function resolveJsMirrorJumpTargets(html: string, requestUrl: string): string[] {
  if (!isJsMirrorJumpPage(html)) return [];

  const evalMatch = html.match(EVAL_DECODE);
  if (!evalMatch?.[1]) return [];

  let decoded: string;
  try {
    decoded = decodeURIComponent(evalMatch[1]);
  } catch {
    return [];
  }

  const url2Entries: string[] = [];
  for (const match of decoded.matchAll(URL2_PUSH)) {
    const entry = match[1]?.trim();
    if (entry) url2Entries.push(entry);
  }
  if (url2Entries.length === 0) return [];

  const protocol = html.match(USE_PROTOCOL)?.[1] ?? 'https://';
  const useDay = Math.max(1, Number.parseInt(html.match(USE_DAY)?.[1] ?? '1', 10) || 1);
  const offsetHour = Number.parseInt(html.match(OFFSET_HOUR)?.[1] ?? '0', 10) || 0;

  let urlt: string;
  try {
    const u = new URL(requestUrl);
    urlt = u.pathname + u.search + u.hash;
  } catch {
    return [];
  }

  const timestamp = Date.now();
  const dayjjj = Math.floor((timestamp + 8 * 3_600_000 - offsetHour * 3_600_000) / 86_400_000 / useDay);
  const entry = url2Entries[dayjjj % url2Entries.length];
  const domains = entry
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const targets: string[] = [];
  for (const domain of domains) {
    const mirror = `${protocol}www.${domain}${urlt}`;
    if (!seen.has(mirror)) {
      seen.add(mirror);
      targets.push(mirror);
    }
  }
  return targets;
}

/** 跟随跳转后是否像真实列表/正文页 */
export function looksLikeJsMirrorJumpResolved(html: string): boolean {
  const trimmed = html.trim();
  return trimmed.length > 4_000 && !isJsMirrorJumpPage(trimmed);
}
