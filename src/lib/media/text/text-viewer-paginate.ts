/** 按内容区实际高度分页（行级断页，避免半行裁切） */

export interface ReaderBlockMetric {
  blockIndex: number;
  top: number;
  height: number;
}

export interface ReaderLineMetric {
  top: number;
  height: number;
}

const LINE_TOP_EPS = 2;

/** 从测量根节点采集块位置（相对内容顶部的像素坐标） */
export function measureBlockMetrics(
  contentRoot: HTMLElement,
  blockSelector = '[data-reader-measure-block]',
): ReaderBlockMetric[] {
  const blocks = contentRoot.querySelectorAll<HTMLElement>(blockSelector);
  if (blocks.length === 0) return [];

  const rootRect = contentRoot.getBoundingClientRect();
  const metrics: ReaderBlockMetric[] = [];

  blocks.forEach((el, order) => {
    const rect = el.getBoundingClientRect();
    metrics.push({
      blockIndex: order,
      top: rect.top - rootRect.top,
      height: rect.height,
    });
  });

  return metrics;
}

/** 采集段落/标题各行（getClientRects），用于行级断页 */
export function measureLineMetrics(contentRoot: HTMLElement): ReaderLineMetric[] {
  const rootRect = contentRoot.getBoundingClientRect();
  const lineMap = new Map<number, ReaderLineMetric>();

  const addRect = (top: number, height: number) => {
    if (height < 0.5) return;
    const key = Math.round(top / LINE_TOP_EPS) * LINE_TOP_EPS;
    const prev = lineMap.get(key);
    if (!prev || height > prev.height) {
      lineMap.set(key, { top, height });
    }
  };

  const blocks = contentRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
  blocks.forEach((block) => {
    const textNodes = block.querySelectorAll<HTMLElement>('.reader-p, h2, figure');
    if (textNodes.length === 0) {
      const rect = block.getBoundingClientRect();
      addRect(rect.top - rootRect.top, rect.height);
      return;
    }

    textNodes.forEach((el) => {
      if (el.tagName === 'FIGURE') {
        const rect = el.getBoundingClientRect();
        addRect(rect.top - rootRect.top, rect.height);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const rect = rects.item(i);
        if (!rect) continue;
        addRect(rect.top - rootRect.top, rect.height);
      }
    });
  });

  return Array.from(lineMap.values()).sort((a, b) => a.top - b.top);
}

export function contentExtentFromLines(
  lines: ReaderLineMetric[],
  contentRoot: HTMLElement,
): number {
  const fromLines = lines.reduce((max, l) => Math.max(max, l.top + l.height), 0);
  return Math.max(fromLines, contentRoot.scrollHeight, contentRoot.clientHeight);
}

/**
 * 行级断页：每页高度为可视区高度，仅在行边界分页（对齐 Legado 行排版思路）。
 */
export function computePageStartsFromLines(
  lines: ReaderLineMetric[],
  pageHeight: number,
  contentExtent?: number,
): number[] {
  const safeHeight = Math.max(1, pageHeight);
  if (lines.length === 0) return [0];

  const contentBottom =
    contentExtent ?? lines.reduce((max, l) => Math.max(max, l.top + l.height), 0);
  if (contentBottom <= safeHeight + 0.5) return [0];

  const starts: number[] = [0];
  let pageStart = 0;

  while (pageStart + safeHeight < contentBottom - 0.5) {
    const pageEnd = pageStart + safeHeight;
    let lastFitting = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.top < pageStart - 0.5) continue;
      if (line.top + line.height <= pageEnd + 0.5) {
        lastFitting = i;
      } else {
        break;
      }
    }

    let nextStart = pageEnd;
    if (lastFitting >= 0 && lastFitting < lines.length - 1) {
      nextStart = lines[lastFitting + 1]!.top;
    } else {
      const nextLine = lines.find(
        (l) => l.top >= pageEnd - 0.5 && l.top > pageStart + 0.5,
      );
      if (nextLine) nextStart = nextLine.top;
    }

    if (nextStart <= pageStart + 0.5) {
      nextStart = pageEnd;
    }

    pageStart = nextStart;
    starts.push(pageStart);
  }

  return starts;
}

/** @deprecated 块级断页，长段落会裁切半行 */
export function computePageStarts(
  metrics: ReaderBlockMetric[],
  pageHeight: number,
): number[] {
  const safeHeight = Math.max(1, pageHeight);
  if (metrics.length === 0) return [0];

  const contentBottom = metrics.reduce(
    (max, m) => Math.max(max, m.top + m.height),
    0,
  );
  if (contentBottom <= safeHeight) return [0];

  const starts: number[] = [0];
  let pageStart = 0;

  while (pageStart + safeHeight < contentBottom - 0.5) {
    const pageEnd = pageStart + safeHeight;
    let nextStart = pageEnd;

    for (const m of metrics) {
      if (m.top >= pageEnd - 0.5) {
        nextStart = Math.min(nextStart, m.top);
        break;
      }
      if (m.top < pageEnd && m.top + m.height > pageEnd + 0.5) {
        if (m.height > safeHeight) {
          nextStart = pageEnd;
        } else if (m.top > pageStart + 1) {
          nextStart = Math.min(nextStart, m.top);
        }
      }
    }

    if (nextStart <= pageStart + 1) {
      nextStart = pageEnd;
    }

    pageStart = nextStart;
    starts.push(pageStart);
  }

  return starts;
}

export function pageCountFromStarts(starts: number[]): number {
  return Math.max(1, starts.length);
}

/** @deprecated */
export function splitBlockIndicesByPageHeight(
  blockHeights: number[],
  pageHeight: number,
): number[][] {
  if (blockHeights.length === 0) return [[]];
  const safeHeight = Math.max(1, pageHeight);
  const pages: number[][] = [];
  let current: number[] = [];
  let acc = 0;

  for (let i = 0; i < blockHeights.length; i++) {
    const h = blockHeights[i] ?? 0;
    if (current.length > 0 && acc + h > safeHeight) {
      pages.push(current);
      current = [];
      acc = 0;
    }
    current.push(i);
    acc += h;
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}
