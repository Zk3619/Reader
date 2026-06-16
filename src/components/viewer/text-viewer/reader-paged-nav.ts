export type ReaderPagedBookmarkSnapshot = {
  chapterPos: number;
  pageText: string;
  pageIndex: number;
  pageCount: number;
};

export type ReaderPagedNavApi = {
  goNextPage: () => void;
  goPrevPage: () => void;
  /** 0–1，用于底栏进度条跳页 */
  setPageProgress: (ratio: number) => void;
  /** 分页模式：当前页正文与章内进度（添加书签时应用，避免 store 滞后） */
  getBookmarkSnapshot: () => ReaderPagedBookmarkSnapshot;
  /** 是否还能向下一页/下一章（自动翻页边界） */
  canGoNextPage: () => boolean;
  /** 揭示下一页：progress 0–1；progress=0 重置；progress=1 提交翻页，返回是否成功 */
  driveAutoPagerReveal?: (progress: number) => boolean;
  /** 当前是否为双页排版（自动翻页应禁用） */
  isDualPageLayoutActive?: () => boolean;
};
