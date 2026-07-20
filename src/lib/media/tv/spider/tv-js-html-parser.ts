/**
 * 对齐 TVBoxOS / FongMi HtmlParser：pdfh / pdfa / pd / pdfl
 * drpy2 模块顶层会引用这些全局（defaultParser = { pdfh, pdfa, pd }）
 */

import * as cheerio from 'cheerio';

/** cheerio 选择结果类型（不依赖 domhandler 直连解析） */
type CheerioNodes = ReturnType<ReturnType<typeof cheerio.load>>;

const NOADD_INDEX = /:eq|:lt|:gt|:first|:last|^body$|^#/;
const URLJOIN_ATTR = /(url|src|href|-original|-src|-play|-url|style)$/i;
const SPECIAL_URL = /^(ftp|magnet|thunder|ws):/i;
const STYLE_URL = /url\((.*?)\)/i;

type ParseInfo = {
  rule: string;
  index: number | null;
  excludes: string[];
};

function joinUrl(parent: string, child: string): string {
  if (!parent) return child ?? '';
  if (!child) return parent;
  try {
    return new URL(child, parent).toString();
  } catch {
    return child;
  }
}

function getParseInfo(nparse: string): ParseInfo {
  let rule = nparse;
  let index: number | null = null;
  let excludes: string[] = [];

  if (nparse.includes(':eq')) {
    const parts = nparse.split(':');
    rule = parts[0] ?? nparse;
    let pos = parts[1] ?? '';
    if (rule.includes('--')) {
      const rules = rule.split('--');
      excludes = rules.slice(1);
      rule = rules[0] ?? rule;
    } else if (pos.includes('--')) {
      const rules = pos.split('--');
      excludes = rules.slice(1);
      pos = rules[0] ?? '';
    }
    const n = Number.parseInt(pos.replace('eq(', '').replace(')', ''), 10);
    index = Number.isNaN(n) ? 0 : n;
  } else if (nparse.includes('--')) {
    const rules = rule.split('--');
    excludes = rules.slice(1);
    rule = rules[0] ?? rule;
  }

  return { rule, index, excludes };
}

function parseHikerToJq(parse: string, first: boolean): string {
  if (parse.includes('&&')) {
    const parses = parse.split('&&');
    return parses
      .map((seg, i) => {
        const pss = seg.trim().split(/\s+/);
        const ps = pss[pss.length - 1] ?? '';
        if (!NOADD_INDEX.test(ps)) {
          if (!first && i >= parses.length - 1) return seg;
          return `${seg}:eq(0)`;
        }
        return seg;
      })
      .join(' ');
  }
  const pss = parse.split(/\s+/);
  const ps = pss[pss.length - 1] ?? '';
  if (!NOADD_INDEX.test(ps) && first) return `${parse}:eq(0)`;
  return parse;
}

function applyParseInfo(
  nodes: CheerioNodes,
  info: ParseInfo,
): CheerioNodes {
  let ret = nodes;
  if (info.index != null && ret.length) {
    const idx = info.index < 0 ? ret.length + info.index : info.index;
    ret = ret.eq(idx);
  }
  if (info.excludes.length && ret.length) {
    for (const ex of info.excludes) {
      ret.find(ex).remove();
    }
  }
  return ret;
}

function selectChain(
  html: string,
  rule: string,
  first: boolean,
): { $: cheerio.CheerioAPI; nodes: CheerioNodes } {
  const $ = cheerio.load(html || '', null, false);
  const parts = parseHikerToJq(rule, first).split(/\s+/).filter(Boolean);
  let nodes = $() as CheerioNodes;
  for (let i = 0; i < parts.length; i++) {
    const info = getParseInfo(parts[i]!);
    const cleanRule = info.rule.replace(/:eq\([^)]*\)/g, '').trim() || info.rule;
    try {
      nodes = i === 0 ? $(cleanRule) : nodes.find(cleanRule);
    } catch {
      return { $, nodes: $() as CheerioNodes };
    }
    nodes = applyParseInfo(nodes, info);
    if (!nodes.length) return { $, nodes };
  }
  return { $, nodes };
}

export function pdfh(html: string, rule: string): string {
  const text = html == null ? '' : String(html);
  const r = String(rule ?? '');
  if (r === 'body&&Text' || r === 'Text') {
    return cheerio.load(text).text();
  }
  if (r === 'body&&Html' || r === 'Html') {
    return cheerio.load(text).html() ?? '';
  }

  let option = '';
  let ruleBody = r;
  if (r.includes('&&')) {
    const rs = r.split('&&');
    option = rs[rs.length - 1] ?? '';
    ruleBody = rs.slice(0, -1).join('&&');
  }

  const { $, nodes } = selectChain(text, ruleBody, true);
  if (!nodes.length) return '';

  if (option) {
    if (option === 'Text') return nodes.text();
    if (option === 'Html') return nodes.html() ?? '';
    let result = nodes.attr(option) ?? '';
    if (/style/i.test(option) && /url\(/.test(result)) {
      const m = result.match(STYLE_URL);
      if (m?.[1]) result = m[1].replace(/^['"](.*)['"]$/, '$1');
    }
    return result;
  }
  return $.html(nodes.get(0)) || '';
}

export function pdfa(html: string, rule: string): string[] {
  const { $, nodes } = selectChain(html == null ? '' : String(html), String(rule ?? ''), false);
  const list: string[] = [];
  nodes.each((_, el) => {
    list.push($.html(el) || '');
  });
  return list;
}

export function pd(html: string, rule: string, addUrl = ''): string {
  let result = pdfh(html, rule);
  const option = rule.includes('&&')
    ? (rule.split('&&').pop() ?? '')
    : (String(rule).split(/\s+/).pop() ?? '');
  if (URLJOIN_ATTR.test(option) && !SPECIAL_URL.test(result) && addUrl) {
    if (/http/i.test(result)) {
      result = result.slice(result.indexOf('http'));
    } else {
      result = joinUrl(addUrl, result);
    }
  }
  return result;
}

export function pdfl(
  html: string,
  listRule: string,
  listText: string,
  listUrl: string,
  addUrl = '',
): string[] {
  return pdfa(html, listRule).map((it) => {
    const title = pdfh(it, listText).trim();
    const url = pd(it, listUrl, addUrl);
    return `${title}$${url}`;
  });
}
