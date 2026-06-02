import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBookInfo } from '@/lib/book-source/detail';
import type { BookSource } from '@/types';
import sourceList from '../../../../examples/1780106748.json';

const GUGU_HTML = readFileSync(
  join(process.cwd(), 'tmp-gugu-detail.html'),
  'utf8',
);

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  HttpError: class HttpError extends Error {},
}));

vi.mock('@/lib/book-source/login-check', () => ({
  assertLoginCheckPassed: vi.fn(async () => {}),
}));

import { get } from '@/lib/http';

describe('咕咕番详情 ruleBookInfo', () => {
  const source = (sourceList as unknown as BookSource[])[0];

  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(get).mockResolvedValue(GUGU_HTML);
  });

  it('无 author 规则时不应臆造作者（对齐 Legado）', async () => {
    const info = await getBookInfo(
      source,
      'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      {
        book: {
          name: '关于我转生变成史莱姆这档事 第四季',
          bookUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
          kind: '2026,日本,奇幻,战斗,异世界,轻改',
        },
      },
    );

    expect(info?.name).toContain('史莱姆');
    expect(info?.author?.trim() ?? '').toBe('');
    expect(info?.kind).toMatch(/奇幻/);
    expect(info?.kind).toMatch(/战斗/);
  });
});
