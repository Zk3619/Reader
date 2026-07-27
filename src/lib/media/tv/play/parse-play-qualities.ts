/**
 * 解析 spider / TVBox playerContent 的多画质 url
 *
 * 对齐 FongMi `UrlAdapter` + `Url`：
 * - 字符串 → 单地址
 * - 数组 → 严格交替 [name, url, name, url, ...]（奇数末项丢弃）
 * - 对象 → { values: [{n,v}], position }
 *
 * 额外兼容：项内 `name$url`、`#` 拼接（部分源站习惯）
 */

export type PlayQuality = {
  name: string;
  url: string;
};

/** FongMi Url JSON 对象形态 */
export type PlayUrlObject = {
  values?: Array<{ n?: string; v?: string }>;
  position?: number;
};

export type PlayUrlField = string | string[] | PlayUrlObject | null | undefined;

function looksLikeMediaUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^file:/i.test(t) || /^asset:/i.test(t) || /^blob:/i.test(t)) return true;
  if (/^(proxy|thunder|magnet|ed2k|tvbus):/i.test(t)) return true;
  if (/\.(m3u8|mp4|flv|mkv|ts|mpd|webm)(\?|#|$)/i.test(t)) return true;
  if (/\/proxy\?/i.test(t) || /format=m3u8|type=m3u8/i.test(t)) return true;
  return false;
}

function guessName(url: string, index: number): string {
  const u = url.toLowerCase();
  if (/2160|4k|uhd/.test(u)) return '4K';
  if (/1440|2k/.test(u)) return '2K';
  if (/1080|fhd/.test(u)) return '1080P';
  if (/720|hd/.test(u)) return '720P';
  if (/480|sd/.test(u)) return '480P';
  if (/360|流畅/.test(u)) return '360P';
  if (/高码/.test(url)) return '1080P 高码率';
  return `画质${index + 1}`;
}

function fromNameUrlPair(name: string, url: string, index: number): PlayQuality | null {
  const u = url.trim();
  if (!u) return null;
  const n = name.trim() || guessName(u, index);
  return { name: n, url: u };
}

function fromDollarItem(raw: string, index: number): PlayQuality | null {
  const s = raw.trim();
  if (!s) return null;
  const dollar = s.indexOf('$');
  if (dollar >= 0) {
    const left = s.slice(0, dollar).trim();
    const right = s.slice(dollar + 1).trim();
    // 直播配置习惯：url$线路名；剧集习惯：名称$url
    if (looksLikeMediaUrl(left) && right && !looksLikeMediaUrl(right)) {
      return { name: right || guessName(left, index), url: left };
    }
    if (right) return fromNameUrlPair(left, right, index);
  }
  if (looksLikeMediaUrl(s)) {
    return { name: guessName(s, index), url: s };
  }
  return null;
}

function isPlayUrlObject(raw: unknown): raw is PlayUrlObject {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    ('values' in raw || 'position' in raw)
  );
}

/** 对齐 FongMi UrlAdapter：数组按 2 步进 name/url */
function fromAlternatingArray(strs: string[]): PlayQuality[] {
  const out: PlayQuality[] = [];
  for (let i = 0; i + 1 < strs.length; i += 2) {
    const q = fromNameUrlPair(strs[i]!, strs[i + 1]!, out.length);
    if (q) out.push(q);
  }
  return out;
}

/** 解析多画质列表 */
export function parsePlayQualities(raw: PlayUrlField): PlayQuality[] {
  if (raw == null) return [];

  if (isPlayUrlObject(raw)) {
    const values = Array.isArray(raw.values) ? raw.values : [];
    return values
      .map((item, i) => {
        const v = String(item?.v ?? '').trim();
        if (!v) return null;
        const n = String(item?.n ?? '').trim() || guessName(v, i);
        return { name: n, url: v } satisfies PlayQuality;
      })
      .filter((q): q is PlayQuality => !!q);
  }

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.includes('#')) {
      const parts = s.split('#').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1 && parts.some((p) => p.includes('$'))) {
        return parts
          .map((part, i) => fromDollarItem(part, i))
          .filter((q): q is PlayQuality => !!q);
      }
    }
    const one = fromDollarItem(s, 0);
    return one ? [one] : [];
  }

  if (!Array.isArray(raw) || raw.length === 0) return [];

  const strs = raw.map((x) => String(x ?? '').trim()).filter((s) => s.length > 0);
  if (!strs.length) return [];

  // 单元素数组：当单地址（FongMi 奇数丢弃会导致空，这里补齐）
  if (strs.length === 1) {
    const one = fromDollarItem(strs[0]!, 0);
    return one ? [one] : [];
  }

  // 全部含 $ → 按项解析（部分源返回 ["超清$url", ...]）
  if (strs.every((s) => s.includes('$'))) {
    const dollarList = strs
      .map((s, i) => fromDollarItem(s, i))
      .filter((q): q is PlayQuality => !!q);
    if (dollarList.length) return dollarList;
  }

  // FongMi 主路径：交替 name/url
  const paired = fromAlternatingArray(strs);
  if (paired.length) return paired;

  // 兜底：逐项当 URL
  const out: PlayQuality[] = [];
  for (let i = 0; i < strs.length; i++) {
    const q = fromDollarItem(strs[i]!, i);
    if (q) out.push(q);
  }
  return out;
}

/** FongMi Url.position：默认选中画质下标 */
export function defaultQualityIndex(raw: PlayUrlField): number {
  if (isPlayUrlObject(raw) && typeof raw.position === 'number' && Number.isFinite(raw.position)) {
    return Math.max(0, Math.floor(raw.position));
  }
  return 0;
}

/** 播放用：有多画质取当前项，否则取原串 */
export function pickPlayUrl(raw: PlayUrlField, qualityIndex = 0): string {
  const list = parsePlayQualities(raw);
  if (list.length) {
    const idx = Math.min(Math.max(qualityIndex, 0), list.length - 1);
    return list[idx]?.url ?? '';
  }
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw[0] != null) {
    // 非标准残留：勿把名称当 URL；尽量取第二项
    if (raw.length >= 2) return String(raw[1]).trim();
    return String(raw[0]).trim();
  }
  return '';
}

/**
 * 仅对真实播放地址做映射，保留画质名。
 * 输出与输入同构：多画质仍为交替数组；单画质为 string。
 */
export function mapPlayUrlField(
  raw: PlayUrlField,
  mapUrl: (url: string) => string,
): string | string[] {
  const list = parsePlayQualities(raw);
  if (!list.length) {
    if (typeof raw === 'string') return mapUrl(raw);
    return '';
  }
  if (list.length === 1) {
    return mapUrl(list[0]!.url);
  }
  return list.flatMap((q) => [q.name, mapUrl(q.url)]);
}
