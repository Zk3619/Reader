/**
 * PagedList helpers — yt-dlp OnDemandPagedList / InAdvancePagedList.
 */

export type PageGetter<T> = (pageNum: number) => Promise<T[]> | T[];

export abstract class PagedList<T> {
  abstract getPage(pageNum: number): Promise<T[]>;
  async *items(): AsyncGenerator<T, void, unknown> {
    for (let page = 0; ; page++) {
      const batch = await this.getPage(page);
      if (!batch.length) break;
      for (const item of batch) yield item;
      if (batch.length < this.pageSize) break;
    }
  }
  pageSize = 1;
}

/** Fetch pages lazily as consumed. */
export class OnDemandPagedList<T> extends PagedList<T> {
  private _cache = new Map<number, T[]>();
  constructor(
    private getter: PageGetter<T>,
    pageSize = 20,
  ) {
    super();
    this.pageSize = pageSize;
  }
  async getPage(pageNum: number): Promise<T[]> {
    if (this._cache.has(pageNum)) return this._cache.get(pageNum)!;
    const page = await this.getter(pageNum);
    const list = Array.isArray(page) ? page : [];
    this._cache.set(pageNum, list);
    return list;
  }
}

/** Prefetch all pages up front (or until getter returns empty). */
export class InAdvancePagedList<T> extends PagedList<T> {
  private _pages: T[][] | null = null;
  constructor(
    private getter: PageGetter<T>,
    private pageCount: number | null = null,
    pageSize = 20,
  ) {
    super();
    this.pageSize = pageSize;
  }
  private async ensure(): Promise<T[][]> {
    if (this._pages) return this._pages;
    const pages: T[][] = [];
    for (let i = 0; this.pageCount == null || i < this.pageCount; i++) {
      const page = await this.getter(i);
      const list = Array.isArray(page) ? page : [];
      if (!list.length) break;
      pages.push(list);
      if (this.pageCount == null && list.length < this.pageSize) break;
    }
    this._pages = pages;
    return pages;
  }
  async getPage(pageNum: number): Promise<T[]> {
    const pages = await this.ensure();
    return pages[pageNum] || [];
  }
  async getAll(): Promise<T[]> {
    const pages = await this.ensure();
    return pages.flat();
  }
}
