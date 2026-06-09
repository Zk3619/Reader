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
};
