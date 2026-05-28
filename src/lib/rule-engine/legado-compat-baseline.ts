export interface LegadoCompatCase {
  id: string;
  stage: 'search' | 'toc' | 'content' | 'explore';
  sourceName: string;
  focus: string[];
}

/**
 * 阶段0冻结的兼容样本（后续可逐步转为自动化集成回归用例）。
 * 说明：样本源名称来自 Legado_Max 的默认书源，当前先以“能力点”维度冻结。
 */
export const LEGADO_COMPAT_BASELINE: LegadoCompatCase[] = [
  {
    id: 'search-js-url-template',
    stage: 'search',
    sourceName: '消消乐听书',
    focus: ['searchUrl', '{{searchPage}}', '@js', 'bookList', 'bookUrl'],
  },
  {
    id: 'toc-next-page',
    stage: 'toc',
    sourceName: '消消乐听书',
    focus: ['chapterList', 'nextTocUrl', 'chapterName', 'chapterUrl'],
  },
  {
    id: 'content-next-page-replace',
    stage: 'content',
    sourceName: '消消乐听书',
    focus: ['content', 'nextContentUrl', 'replaceRegex'],
  },
  {
    id: 'explore-js-sections',
    stage: 'explore',
    sourceName: '消消乐听书',
    focus: ['exploreUrl', '<js>', 'bookList'],
  },
];
