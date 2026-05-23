/**
 * 书籍简介合并：详情页应展示完整简介（含聚合书源的元信息块），
 * 避免发现列表短简介覆盖详情 API 返回的长文本。
 */

/** Legado 特殊简介格式，不做 HTML 剥离 */
function isLegadoMarkedIntro(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith('<usehtml>') ||
    t.startsWith('<md>') ||
    t.startsWith('<useweb>')
  );
}

function decodeHtmlEntities(text: string): string {
  if (!/&(?:#\d+|#x[\da-fA-F]+|\w+);/.test(text)) return text;
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  }
  return text
    .replace(/&lrm;/gi, '\u200E')
    .replace(/&rlm;/gi, '\u200F')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * 纯文本简介清洗（对齐 Legado HtmlFormatter.format + 解码实体）
 * 晴天等书源常用 &lrm; 作分隔，需解码为 U+200E 后移除，否则会原样显示。
 */
export function formatBookIntroPlainText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || isLegadoMarkedIntro(trimmed)) return trimmed;

  let s = decodeHtmlEntities(trimmed);
  s = s
    .replace(/(&nbsp;)+/gi, ' ')
    .replace(/(&ensp;|&emsp;)/gi, ' ')
    .replace(/&thinsp;|&zwnj;|&zwj;/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/?(?:div|p|br|hr|h\d|article|dd|dl)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

function normalizeIntro(s: string | undefined | null): string | undefined {
  const raw = s?.trim();
  if (!raw) return undefined;
  const t = formatBookIntroPlainText(raw);
  if (!t) return undefined;
  // 仅当全文无非空白、非标点内容时视为无效（避免误杀中文简介）
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(t)) return undefined;
  return t;
}

/** 详情 API 字段优先（对齐 legado：进入详情后更新书名、封面、作者） */
export function preferDetailField(
  fresh: string | undefined,
  existing: string | undefined,
): string | undefined {
  const f = fresh?.trim();
  if (f) return f;
  const e = existing?.trim();
  return e || undefined;
}

function coerceIntroText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return normalizeIntro(raw);
  if (raw == null) return undefined;
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return normalizeIntro(String(raw));
  }
  return undefined;
}

/** 误把详情 API 的 data 对象 JSON.stringify 进 intro 时的检测 */
export function isLikelySerializedBookDetailJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return false;
  return /"book_name"|"book_id"|"thumb_url"/.test(t);
}

function sanitizeIntroCandidate(s: string | undefined): string | undefined {
  const t = normalizeIntro(s);
  if (!t) return undefined;
  if (!isLikelySerializedBookDetailJson(t)) return t;
  try {
    const data = JSON.parse(t) as Record<string, unknown>;
    return buildIntroFromDetailJson(data) ?? undefined;
  } catch {
    return undefined;
  }
}

/** 简介是否含书源 ruleBookInfo.intro 脚本生成的元信息块 */
export function introHasMetadataBlock(text: string): boolean {
  return /当前服务|数据来源|欢迎回来|账号状态|书籍分类：|书籍简介：/i.test(text);
}

/** 详情简介优先：含元信息块或明显更完整时采用详情结果 */
export function preferDetailIntro(
  fresh: string | undefined,
  existing: string | undefined,
): string | undefined {
  const f = sanitizeIntroCandidate(fresh);
  const e = sanitizeIntroCandidate(existing);
  if (!f) return e;
  if (!e) return f;
  if (introHasMetadataBlock(f)) return f;
  if (introHasMetadataBlock(e) && !introHasMetadataBlock(f)) return e;
  return mergeBookIntro(e, f);
}

/** 详情刷新后合并简介：优先更完整的一方（通常来自详情 API） */
export function mergeBookIntro(
  existing: string | undefined,
  fresh: string | undefined,
): string | undefined {
  const a = normalizeIntro(existing);
  const b = normalizeIntro(fresh);
  if (!b) return a;
  if (!a) return b;
  if (b.includes(a) && b.length > a.length) return b;
  if (a.includes(b) && a.length >= b.length) return a;
  const lineA = (a.match(/\n/g) ?? []).length;
  const lineB = (b.match(/\n/g) ?? []).length;
  if (lineB > lineA) return b;
  if (lineA > lineB) return a;
  if (b.length >= a.length) return b;
  return a;
}

const DETAIL_INTRO_FIELD_KEYS = [
  'abstract',
  'desc',
  'description',
  'book_desc',
  'intro',
  'book_intro',
  'summary',
  'book_summary',
  'book_info',
  'extra_info',
  'info',
  'remark',
  'content',
] as const;

/** 从聚合详情 JSON 拼装简介（多字段去重拼接） */
export function buildIntroFromDetailJson(data: Record<string, unknown>): string | undefined {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const key of DETAIL_INTRO_FIELD_KEYS) {
    const t = coerceIntroText(data[key]);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    parts.push(t);
  }
  if (parts.length === 0) return undefined;
  return parts.join('\n\n');
}

