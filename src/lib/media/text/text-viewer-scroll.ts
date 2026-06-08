/**
 * 滚动阅读模式：多章衔接、可见章进度计算（对齐 Legado 滚动模式）
 */

export type ScrollChapterSection = {
  index: number;
  top: number;
  height: number;
};

export type ScrollChapterProgress = {
  chapterIndex: number;
  chapterPos: number;
};

/** 根据视口中心落在哪一章，计算 0–1 章内进度 */
export function findVisibleChapterProgress(
  scrollTop: number,
  clientHeight: number,
  sections: ScrollChapterSection[],
): ScrollChapterProgress | null {
  if (sections.length === 0 || clientHeight <= 0) return null;

  const last = sections[sections.length - 1]!;
  if (scrollTop + clientHeight >= last.top + last.height - 2) {
    return { chapterIndex: last.index, chapterPos: 1 };
  }

  const anchor = scrollTop + clientHeight * 0.35;
  for (const section of sections) {
    const bottom = section.top + section.height;
    if (anchor < section.top || anchor >= bottom) continue;
    const pos =
      section.height > 0
        ? Math.max(0, Math.min(1, (anchor - section.top) / section.height))
        : 0;
    return { chapterIndex: section.index, chapterPos: pos };
  }

  const first = sections[0]!;
  if (scrollTop <= first.top) {
    return { chapterIndex: first.index, chapterPos: 0 };
  }
  return null;
}

/** 章内进度 → 容器 scrollTop */
export function scrollTopForChapterPos(
  sectionTop: number,
  sectionHeight: number,
  clientHeight: number,
  pos: number,
): number {
  const clamped = Math.max(0, Math.min(1, pos));
  const maxScroll = Math.max(0, sectionTop + sectionHeight - clientHeight);
  if (sectionHeight <= clientHeight) {
    return Math.min(sectionTop, maxScroll);
  }
  const inner = sectionHeight - clientHeight;
  return sectionTop + clamped * inner;
}

export function elementTopInScrollContainer(
  element: HTMLElement,
  scrollContainer: HTMLElement,
): number {
  const elRect = element.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  return elRect.top - containerRect.top + scrollContainer.scrollTop;
}

export function collectScrollChapterSections(
  scrollContainer: HTMLElement,
): ScrollChapterSection[] {
  const nodes = scrollContainer.querySelectorAll<HTMLElement>(
    '[data-reader-scroll-chapter]',
  );
  const sections: ScrollChapterSection[] = [];
  nodes.forEach((node) => {
    const raw = node.dataset.readerScrollChapter;
    const index = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(index)) return;
    const top = elementTopInScrollContainer(node, scrollContainer);
    const height = node.offsetHeight;
    if (height <= 0) return;
    sections.push({ index, top, height });
  });
  sections.sort((a, b) => a.top - b.top);
  return sections;
}
