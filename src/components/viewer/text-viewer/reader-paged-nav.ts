export type ReaderPagedNavApi = {
  goNextPage: () => void;
  goPrevPage: () => void;
  /** 0–1，用于底栏进度条跳页 */
  setPageProgress: (ratio: number) => void;
};
