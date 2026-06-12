export type LegadoResponse<T> = {
  isSuccess: boolean;
  errorMsg: string;
  data: T;
};

export interface WebBook {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  customCoverUrl?: string;
  originName?: string;
  durChapterIndex?: number;
  durChapterTitle?: string;
  lastCheckTime?: number;
  totalChapterNum?: number;
}

export interface WebChapter {
  url: string;
  title: string;
  index: number;
  bookUrl: string;
  isVolume?: boolean;
}

export interface WebBookSource {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceGroup?: string;
  enabled?: boolean;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = (await res.json()) as LegadoResponse<T>;
  if (!json.isSuccess) {
    throw new Error(json.errorMsg || '请求失败');
  }
  return json.data;
}

export function getBookshelf() {
  return apiGet<WebBook[]>('/getBookshelf');
}

export function getChapterList(bookUrl: string) {
  return apiGet<WebChapter[]>(`/getChapterList?url=${encodeURIComponent(bookUrl)}`);
}

export function getBookContent(bookUrl: string, index: number) {
  return apiGet<string>(
    `/getBookContent?url=${encodeURIComponent(bookUrl)}&index=${index}`,
  );
}

export function getBookSources() {
  return apiGet<WebBookSource[]>('/getBookSources');
}

export function coverUrl(book: WebBook): string {
  const url = book.customCoverUrl || book.coverUrl;
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('/')) return url;
  return `/cover?path=${encodeURIComponent(url)}`;
}

export function saveBookProgress(payload: {
  name: string;
  author: string;
  durChapterIndex: number;
  durChapterTitle?: string;
}) {
  return fetch('/saveBookProgress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}
