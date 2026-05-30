/**
 * 引号感知扫描 `<img …>`，避免 `[^>]*` 在属性值含 `>`/引号时截断导致隔页丢失。
 */
export function scanImgTags(html: string): string[] {
  if (!html?.includes('<img')) return [];
  const tags: string[] = [];
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf('<img', i);
    if (start < 0) break;
    let j = start + 4;
    let quote: '"' | "'" | null = null;
    while (j < html.length) {
      const c = html[j]!;
      if (quote) {
        if (c === quote) {
          quote = null;
        } else if (c === '&') {
          const semi = html.indexOf(';', j + 1);
          if (semi > j && semi - j < 16) {
            j = semi;
          }
        }
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        tags.push(html.slice(start, j + 1));
        j += 1;
        break;
      }
      j += 1;
    }
    i = j > start + 4 ? j : start + 4;
  }
  return tags;
}

function decodeHtmlAttrEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<');
}

/** Legado 段评 SVG：`data:...;base64,... ,{"click":"..."}` 内 JSON 含未转义双引号 */
function legadoDataUrlJsonBraceDepth(value: string): number {
  const m = value.match(/,\s*\{/);
  if (!m || m.index == null) return 0;
  const jsonStart = value.indexOf('{', m.index);
  if (jsonStart < 0) return 0;
  let depth = 0;
  for (let i = jsonStart; i < value.length; i++) {
    const c = value[i]!;
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
  }
  return depth;
}

function readQuotedHtmlAttrRaw(tag: string, name: string): string | undefined {
  const attrRe = new RegExp(`\\s${name}\\s*=`, 'i');
  const attrMatch = tag.match(attrRe);
  if (!attrMatch || attrMatch.index == null) return undefined;

  let i = attrMatch.index + attrMatch[0].length;
  while (i < tag.length && /\s/.test(tag[i]!)) i += 1;

  const openQuote = tag[i];
  if (openQuote !== '"' && openQuote !== "'") return undefined;
  i += 1;

  let value = '';
  while (i < tag.length) {
    const c = tag[i]!;
    if (c === openQuote) {
      if (
        /^data:/i.test(value) &&
        /,\s*\{/.test(value) &&
        legadoDataUrlJsonBraceDepth(value) > 0
      ) {
        value += c;
        i += 1;
        continue;
      }
      break;
    }
    if (c === '&') {
      const semi = tag.indexOf(';', i + 1);
      if (semi > i && semi - i < 16) {
        value += tag.slice(i, semi + 1);
        i = semi + 1;
        continue;
      }
    }
    value += c;
    i += 1;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

/** 从 HTML 标签字符串读取属性值（引号感知，支持 &quot; 实体） */
export function readHtmlAttr(tag: string, name: string): string | undefined {
  const legadoRaw = readQuotedHtmlAttrRaw(tag, name);
  if (legadoRaw != null) {
    return decodeHtmlAttrEntities(legadoRaw);
  }

  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  if (!m) return undefined;
  const raw = (m[2] ?? m[3] ?? '').trim();
  if (!raw) return undefined;
  return decodeHtmlAttrEntities(raw);
}

/** 替换或追加 img 的 style 属性（引号感知，不误伤 data-legado-headers） */
export function upsertImgTagStyle(imgTag: string, styleAttr: string): string {
  const styleRe = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i;
  if (styleRe.test(imgTag)) {
    return imgTag.replace(styleRe, ` ${styleAttr}`);
  }
  if (/\/>$/.test(imgTag.trim())) {
    return imgTag.replace(/\/>\s*$/, ` ${styleAttr} />`);
  }
  return imgTag.replace(/>\s*$/, ` ${styleAttr}>`);
}
