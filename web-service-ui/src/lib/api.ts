import { getStoredWebToken, setStoredWebToken, withTokenQuery } from '@/lib/api-token';
import { resolveApiUrl, resolveWsUrl } from '@/lib/api-config';

export type LegadoResponse<T> = {
  isSuccess: boolean;
  errorMsg: string;
  data: T;
};

export interface RssSourceDebugResult {
  logs: BookSourceDebugLogEntry[];
  snapshots: {
    listHtml?: string;
    contentHtml?: string;
  };
}

export interface WebBook {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  customCoverUrl?: string;
  originName?: string;
  durChapterIndex?: number;
  durChapterPos?: number;
  durChapterTitle?: string;
  durChapterTime?: number;
  lastCheckTime?: number;
  totalChapterNum?: number;
  latestChapterTitle?: string;
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
  sourceUrl?: string;
  sourceName?: string;
  sourceGroup?: string;
  [key: string]: unknown;
}

export interface WebRssSource {
  sourceUrl: string;
  sourceName: string;
  sourceGroup?: string;
  sourceType?: number;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface ReplaceRule {
  id: number;
  name: string;
  group?: string;
  pattern: string;
  replacement: string;
  scope?: string;
  scopeTitle: boolean;
  scopeContent: boolean;
  excludeScope?: string;
  isEnabled: boolean;
  isRegex: boolean;
  timeoutMillisecond: number;
  order: number;
}

export interface ReaderUiConfig {
  fontSize?: number;
  lineHeight?: number;
  readWidth?: number;
  fontFamily?: string;
  themeName?: string;
  theme?: number;
  font?: number;
  customFontName?: string;
  infiniteLoading?: boolean;
  jumpDuration?: number;
  spacing?: { paragraph: number; line: number; letter: number };
  [key: string]: unknown;
}

export interface WebSearchBook {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  intro?: string;
  kind?: string;
  origin: string;
  originName: string;
  latestChapterTitle?: string;
  respondTime?: number;
  tocUrl?: string;
  [key: string]: unknown;
}

export interface BookSourceDebugLogEntry {
  state: number;
  message: string;
}

export interface BookSourceDebugResult {
  logs: BookSourceDebugLogEntry[];
  snapshots: {
    searchHtml?: string;
    bookHtml?: string;
    tocHtml?: string;
    contentHtml?: string;
  };
}

export { getStoredWebToken, setStoredWebToken } from '@/lib/api-token';

function authHeaders(): Record<string, string> {
  const token = getStoredWebToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}`, token };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(resolveApiUrl(path), { headers: authHeaders() });
  const json = (await res.json()) as LegadoResponse<T>;
  if (!json.isSuccess) {
    throw new Error(json.errorMsg || '请求失败');
  }
  return json.data;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as LegadoResponse<T>;
  if (!json.isSuccess) {
    throw new Error(json.errorMsg || '请求失败');
  }
  return json.data;
}

export function getWebServicePort(): number {
  const base = (() => {
    try {
      return localStorage.getItem('reader_web_api_base')?.trim() ?? '';
    } catch {
      return '';
    }
  })();
  if (base) {
    try {
      const u = new URL(base);
      if (u.port) return Number(u.port);
      return u.protocol === 'https:' ? 443 : 80;
    } catch {
      /* fall through */
    }
  }
  const port = Number(new URL(window.location.href).port);
  return port > 0 ? port : 1122;
}

export async function testApiConnection(baseUrl?: string): Promise<void> {
  const path = '/getReadConfig';
  const url = baseUrl?.trim()
    ? `${baseUrl.replace(/\/$/, '')}${path}`
    : resolveApiUrl(path);
  const res = await fetch(url, { headers: authHeaders() });
  const json = (await res.json()) as LegadoResponse<string>;
  if (!json.isSuccess) throw new Error(json.errorMsg || '连接失败');
}

export function wsDebugUrl(path = '/bookSourceDebug'): string {
  return resolveWsUrl(path);
}

export async function uploadLocalBook(file: File): Promise<boolean> {
  const fd = new FormData();
  fd.append('fileName', file.name);
  fd.append('fileData', file);
  const res = await fetch(resolveApiUrl('/addLocalBook'), {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  const json = (await res.json()) as LegadoResponse<boolean>;
  if (!json.isSuccess) throw new Error(json.errorMsg || '上传失败');
  return json.data;
}

export function runBookSourceDebugWs(
  tag: string,
  key: string,
  source?: unknown,
  onMessage?: (line: string) => void,
): WebSocket {
  const ws = new WebSocket(wsDebugUrl('/bookSourceDebug'));
  ws.onopen = () => {
    ws.send(JSON.stringify({ tag, key, source }));
  };
  ws.onmessage = (ev) => {
    onMessage?.(String(ev.data));
  };
  return ws;
}

export function runRssSourceDebugWs(
  tag: string,
  key: string,
  source?: unknown,
  onMessage?: (line: string) => void,
): WebSocket {
  const ws = new WebSocket(wsDebugUrl('/rssSourceDebug'));
  ws.onopen = () => {
    ws.send(JSON.stringify({ tag, key, source }));
  };
  ws.onmessage = (ev) => {
    onMessage?.(String(ev.data));
  };
  return ws;
}

export function runSearchBookWs(
  key: string,
  onResults: (books: WebSearchBook[]) => void,
  onFinish?: () => void,
  onError?: (message: string) => void,
): WebSocket {
  const ws = new WebSocket(wsDebugUrl('/searchBook'));
  ws.onopen = () => {
    ws.send(JSON.stringify({ key }));
  };
  ws.onmessage = (ev) => {
    const text = String(ev.data);
    try {
      const books = JSON.parse(text) as WebSearchBook[];
      if (Array.isArray(books)) onResults(books);
    } catch {
      if (text.trim()) onError?.(text);
    }
  };
  ws.onerror = () => onError?.('WebSocket 连接失败');
  ws.onclose = () => onFinish?.();
  return ws;
}

export function getBookshelf() {
  return apiGet<WebBook[]>('/getBookshelf');
}

export function getChapterList(bookUrl: string) {
  return apiGet<WebChapter[]>(`/getChapterList?url=${encodeURIComponent(bookUrl)}`);
}

export function refreshToc(bookUrl: string) {
  return apiGet<WebChapter[]>(`/refreshToc?url=${encodeURIComponent(bookUrl)}`);
}

export function getBookContent(bookUrl: string, index: number) {
  return apiGet<string>(
    `/getBookContent?url=${encodeURIComponent(bookUrl)}&index=${index}`,
  );
}

export function getBookSources() {
  return apiGet<WebBookSource[]>('/getBookSources');
}

export function getBookSource(url: string) {
  return apiGet<WebBookSource>(`/getBookSource?url=${encodeURIComponent(url)}`);
}

export function saveBookSource(source: unknown) {
  return apiPost<null>('/saveBookSource', source);
}

export function saveBookSources(sources: unknown[]) {
  return apiPost<unknown[]>('/saveBookSources', sources);
}

export function deleteBookSources(sources: { bookSourceUrl?: string; sourceUrl?: string }[]) {
  return apiPost<string>('/deleteBookSources', sources);
}

export function debugBookSource(source: unknown, key: string) {
  return apiPost<BookSourceDebugResult>('/debugBookSource', { source, key });
}

export function getRssSources() {
  return apiGet<WebRssSource[]>('/getRssSources');
}

export function getRssSource(url: string) {
  return apiGet<WebRssSource>(`/getRssSource?url=${encodeURIComponent(url)}`);
}

export function saveRssSource(source: unknown) {
  return apiPost<null>('/saveRssSource', source);
}

export function deleteRssSources(sources: { sourceUrl: string }[]) {
  return apiPost<string>('/deleteRssSources', sources);
}

export function saveRssSources(sources: unknown[]) {
  return apiPost<unknown[]>('/saveRssSources', sources);
}

export function saveBook(book: WebBook) {
  return apiPost<string>('/saveBook', book);
}

export function debugRssSource(source: unknown, key: string) {
  return apiPost<RssSourceDebugResult>('/debugRssSource', { source, key });
}

export interface WebRssArticle {
  origin: string;
  link: string;
  sort: string;
  title: string;
  order: number;
  pubDate?: string;
  description?: string;
  content?: string;
  image?: string;
  group: string;
  read: boolean;
  type: number;
  durPos: number;
}

export interface RssSortEntry {
  name: string;
  url: string;
}

export interface RssArticlesRefreshResult {
  count: number;
  sort: string;
  articles: WebRssArticle[];
}

export interface RssReadSessionPayload {
  mode: 'content' | 'url' | 'startHtml' | 'proxy';
  title: string;
  html?: string;
  directUrl?: string;
  pageUrl: string;
  article?: WebRssArticle;
  starred?: boolean;
}

export interface WebRssReadRecord {
  record: string;
  origin: string;
  sort: string;
  title?: string;
  readTime?: number;
  read: boolean;
  image?: string;
  type: number;
  durPos: number;
  pubDate?: string;
}

export interface WebRssStar {
  origin: string;
  link: string;
  sort: string;
  title: string;
  starTime: number;
  pubDate?: string;
  description?: string;
  content?: string;
  image?: string;
  group: string;
  type: number;
  durPos: number;
}

export function getRssSorts(origin: string) {
  return apiGet<RssSortEntry[]>(`/getRssSorts?url=${encodeURIComponent(origin)}`);
}

export function getRssArticles(origin: string, sort = '') {
  const q = new URLSearchParams({ origin, sort });
  return apiGet<WebRssArticle[]>(`/getRssArticles?${q}`);
}

export function refreshRssArticles(origin: string, sort?: string, page = 1) {
  const q = new URLSearchParams({ origin, page: String(page) });
  if (sort != null) q.set('sort', sort);
  return apiGet<RssArticlesRefreshResult>(`/refreshRssArticles?${q}`);
}

export function getRssArticleRead(params: {
  origin: string;
  link?: string;
  title?: string;
  start?: boolean;
  openUrl?: string;
}) {
  const q = new URLSearchParams({ origin: params.origin });
  if (params.link) q.set('link', params.link);
  if (params.title) q.set('title', params.title);
  if (params.start) q.set('start', '1');
  if (params.openUrl) q.set('openUrl', params.openUrl);
  return apiGet<RssReadSessionPayload>(`/getRssArticleRead?${q}`);
}

export function clearRssArticles(origin: string, sort?: string) {
  const q = new URLSearchParams({ origin });
  if (sort != null) q.set('sort', sort);
  return apiGet<string>(`/clearRssArticles?${q}`);
}

export function getRssReadRecords(origin?: string) {
  const q = origin ? `?origin=${encodeURIComponent(origin)}` : '';
  return apiGet<WebRssReadRecord[]>(`/getRssReadRecords${q}`);
}

export function deleteRssReadRecord(record: string) {
  return apiPost<string>('/deleteRssReadRecord', { record });
}

export function getRssStars(origin?: string) {
  const q = origin ? `?origin=${encodeURIComponent(origin)}` : '';
  return apiGet<WebRssStar[]>(`/getRssStars${q}`);
}

export function saveRssStar(star: WebRssStar) {
  return apiPost<null>('/saveRssStar', star);
}

export function deleteRssStar(origin: string, link: string) {
  return apiPost<string>('/deleteRssStar', { origin, link });
}

export function getReplaceRules() {
  return apiGet<string>('/getReplaceRules').then((raw) => {
    try {
      return JSON.parse(raw) as ReplaceRule[];
    } catch {
      return [] as ReplaceRule[];
    }
  });
}

export function saveReplaceRule(rule: ReplaceRule) {
  return apiPost<null>('/saveReplaceRule', rule);
}

export function deleteReplaceRule(rule: ReplaceRule) {
  return apiPost<null>('/deleteReplaceRule', rule);
}

export function testReplaceRule(rule: ReplaceRule, text: string) {
  return apiPost<string>('/testReplaceRule', { rule, text });
}

export function getReadConfig() {
  return apiGet<string>('/getReadConfig').then((raw) => {
    try {
      return JSON.parse(raw) as ReaderUiConfig;
    } catch {
      return {} as ReaderUiConfig;
    }
  });
}

export function saveReadConfig(config: ReaderUiConfig) {
  return apiPost<string>('/saveReadConfig', config);
}

export function deleteBook(book: WebBook) {
  return apiPost<string>('/deleteBook', book);
}

export function getBackupPreview() {
  return apiGet<import('@/lib/backup-overview').BackupOverview>('/backupPreview');
}

export interface RestoreBackupResult {
  summary: string[];
  reloadRecommended: boolean;
}

export async function restoreBackup(file: File, replace = true): Promise<RestoreBackupResult> {
  const form = new FormData();
  form.append('fileName', file.name);
  form.append('fileData', file, file.name);
  const url = resolveApiUrl('/restoreBackup');
  const token = getStoredWebToken();
  const headers: Record<string, string> = {};
  if (token) headers.token = token;
  const res = await fetch(withTokenQuery(url), {
    method: 'POST',
    headers,
    body: form,
  });
  const json = (await res.json()) as LegadoResponse<RestoreBackupResult>;
  if (!json.isSuccess) throw new Error(json.errorMsg || '还原失败');
  return json.data;
}

export function downloadBackup(): Promise<Blob> {
  return fetch(resolveApiUrl('/backup')).then((res) => {
    if (!res.ok) throw new Error(res.statusText || '下载失败');
    return res.blob();
  });
}

export interface RemoteBackupEntry {
  name: string;
  size: number;
  lastModify: number;
}

export function getWebDavBackupList() {
  return apiGet<{ backups: RemoteBackupEntry[] }>('/webDavBackupList');
}

export function uploadWebDavBackup() {
  return apiPost<{ fileName: string; size: number }>('/webDavBackupUpload', {});
}

export function restoreWebDavBackup(fileName: string) {
  return apiPost<RestoreBackupResult>('/webDavBackupRestore', { fileName });
}

export function syncWebDavAssets() {
  return apiPost<{ progressUpdated: number; bgUploaded: number; bgDownloaded: number }>(
    '/webDavSyncAssets',
    {},
  );
}

export function coverUrl(book: WebBook, forceProxy = false): string {
  const raw = book.customCoverUrl || book.coverUrl;
  if (!raw) {
    if (book.bookUrl) return resolveApiUrl(`/cover?path=${encodeURIComponent(book.bookUrl)}`);
    return '';
  }
  if (forceProxy || !raw.startsWith('data:')) {
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/') || !raw.includes('://')) {
      const path = raw.startsWith('/') ? raw : `/cover?path=${encodeURIComponent(raw)}`;
      return resolveApiUrl(path);
    }
  }
  return raw;
}

export function proxyCoverUrl(url: string): string {
  if (!url || url.includes('/cover?') || url.includes('cover?path=')) return url;
  return resolveApiUrl(`/cover?path=${encodeURIComponent(url)}`);
}

export function saveBookProgress(payload: {
  name: string;
  author: string;
  durChapterIndex: number;
  durChapterPos?: number;
  durChapterTitle?: string;
  durChapterTime?: number;
}) {
  return fetch(resolveApiUrl('/saveBookProgress'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

export function sourceUrlOf(s: WebBookSource): string {
  return s.bookSourceUrl || s.sourceUrl || '';
}

export function sourceNameOf(s: WebBookSource): string {
  return s.bookSourceName || s.sourceName || '';
}
