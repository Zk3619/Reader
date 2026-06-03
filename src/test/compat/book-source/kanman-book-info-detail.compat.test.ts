import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { BookSource } from '@/types';

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  HttpError: class HttpError extends Error {},
}));

import { get } from '@/lib/http';
import { getBookInfo } from '@/lib/book-source/detail';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KANMAN_HTML = join(__dirname, '../../fixtures/kanman-book-info.html');
const KANMAN_SOURCE = join(__dirname, '../../../../examples/看漫画.json');

function loadSource(): BookSource {
  const raw = JSON.parse(readFileSync(KANMAN_SOURCE, 'utf8')) as BookSource[];
  const source = raw[0]!;
  return {
    ...source,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName,
  } as BookSource;
}

describe('看漫画详情 ruleBookInfo og:novel:author', () => {
  const source = loadSource();
  const html = () => readFileSync(KANMAN_HTML, 'utf8');

  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(get).mockResolvedValue(html());
  });

  it('getBookInfo 解析 meta[property="og:novel:author"]@content', async () => {
    const info = await getBookInfo(source, 'https://www.kanman.com/27417/');
    expect(info?.author).toBe('飒飒动漫');
    expect(info?.name).toBe('测试漫画名');
  });
});
