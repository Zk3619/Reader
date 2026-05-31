/** 正文/简介等纯文本中的 HTML 实体解码（含 &#34; 等数字实体） */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  lrm: '\u200E',
  rlm: '\u200F',
};

export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;

  if (typeof document !== 'undefined' && !/<[a-zA-Z!/]/.test(text)) {
    const ta = document.createElement('textarea');
    ta.innerHTML = text;
    if (ta.value) return ta.value;
  }

  return decodeHtmlEntitiesFallback(text);
}

export function decodeHtmlEntitiesFallback(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, digits) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-zA-Z]+);/g, (entity, name) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}
