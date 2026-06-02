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
