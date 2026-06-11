/**
 * Legado 规则脚本中的 org.jsoup.Jsoup（Cheerio 子集）
 * 对齐：Jsoup.parse(html).select(css).size().get(i).text().attr(name)
 */

import * as cheerio from 'cheerio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legado jsoup 垫片，节点类型与 cheerio 内部 AnyNode 对齐
type CheerioNode = cheerio.Cheerio<any>;

class LegadoJsoupElements {
  constructor(private readonly nodes: CheerioNode) {}

  size(): number {
    return this.nodes.length;
  }

  get(index: number): LegadoJsoupElement {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) {
      return new LegadoJsoupElement(this.nodes.eq(0));
    }
    return new LegadoJsoupElement(this.nodes.eq(i));
  }

  /** Jsoup Elements.first */
  first(): LegadoJsoupElement {
    return this.get(0);
  }

  /** Jsoup Elements.select：对每个元素执行 select 并合并结果 */
  select(selector: string): LegadoJsoupElements {
    const sel = String(selector ?? '').trim();
    if (!sel || this.nodes.length === 0) {
      return new LegadoJsoupElements(this.nodes.slice(0, 0));
    }
    const merged: any[] = [];
    this.nodes.each((_, el) => {
      const $child = cheerio.load(el as any, { xml: false });
      $child(sel).each((__, node) => {
        merged.push(node);
      });
    });
    const $ = cheerio.load('');
    return new LegadoJsoupElements($(merged));
  }

  /** Jsoup Elements.text：合并全部匹配元素的文本 */
  text(): string {
    return this.nodes.text();
  }

  attr(name: string): string {
    if (this.nodes.length === 0) return '';
    return this.nodes.eq(0).attr(String(name ?? '')) ?? '';
  }

  html(): string {
    return this.nodes
      .map((_, el) => cheerio.load(el as any).html() ?? '')
      .get()
      .join('');
  }
}

class LegadoJsoupElement {
  constructor(private readonly el: CheerioNode) {}

  select(selector: string): LegadoJsoupElements {
    const sel = String(selector ?? '').trim();
    if (!sel) {
      return new LegadoJsoupElements(this.el.slice(0, 0));
    }
    return new LegadoJsoupElements(this.el.find(sel));
  }

  text(): string {
    return this.el.text();
  }

  attr(name: string): string {
    return this.el.attr(String(name ?? '')) ?? '';
  }

  /** 单元素 outerHTML（列表项序列化） */
  outerHtml(): string {
    if (this.el.length === 0) return '';
    return this.el.toString();
  }
}

class LegadoJsoupDocument extends LegadoJsoupElement {
  constructor($: cheerio.CheerioAPI) {
    super($('html').length ? $('html') : $.root());
    this.root = $;
  }

  private readonly root: cheerio.CheerioAPI;

  override select(selector: string): LegadoJsoupElements {
    const sel = String(selector ?? '').trim();
    if (!sel) {
      return new LegadoJsoupElements(this.root([]));
    }
    return new LegadoJsoupElements(this.root(sel));
  }
}

export function parseLegadoJsoupHtml(html: string): LegadoJsoupDocument {
  const $ = cheerio.load(String(html ?? ''), { xml: false });
  return new LegadoJsoupDocument($);
}

/** 规则 @js 是否把 result 当作 Jsoup Element（如 result.select(...).text()） */
export function ruleJsExpectsHtmlElement(code: string): boolean {
  return /\bresult\.(select|text|attr|html|ownText|data)\s*\(/.test(String(code ?? ''));
}

/**
 * 将列表项 HTML 包装为 Legado Jsoup 元素（对齐 AnalyzeRule 传入的 Element）
 */
/** 是否为 Jsoup Elements 集合（含 size/get，区别于单 Element） */
export function isLegadoJsoupElementsCollection(value: unknown): value is LegadoJsoupElements {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as LegadoJsoupElements).size === 'function' &&
    typeof (value as LegadoJsoupElements).get === 'function'
  );
}

/** 将 @js 列表规则产出的 Elements 展开为 outerHTML 字符串列表 */
export function expandLegadoJsoupElements(value: unknown): string[] | null {
  if (!isLegadoJsoupElementsCollection(value)) return null;
  const n = value.size();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const html = value.get(i).outerHtml().trim();
    if (html) out.push(html);
  }
  return out;
}

export function wrapRuleJsHtmlResult(
  raw: unknown,
  options: { content?: string; contentType?: 'html' | 'json' | 'text' },
): unknown {
  if (options.contentType === 'json') {
    return raw ?? null;
  }
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { select?: unknown }).select === 'function'
  ) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    return raw;
  }
  const content = String(options.content ?? '');
  const fromRaw = typeof raw === 'string' ? raw : '';
  const html = fromRaw.trim().includes('<') ? fromRaw : content;
  if (!html.trim().includes('<')) {
    return raw ?? null;
  }
  return parseLegadoJsoupHtml(html);
}

/** 注入 rule-script-runner scope：org.jsoup.Jsoup.parse */
export function createLegadoJsoupScopeBindings(): {
  org: { jsoup: { Jsoup: { parse: (html: string) => LegadoJsoupDocument } } };
} {
  return {
    org: {
      jsoup: {
        Jsoup: {
          parse(html: string) {
            return parseLegadoJsoupHtml(html);
          },
        },
      },
    },
  };
}
