import { describe, expect, it, vi, beforeEach } from 'vitest';
import { dispatchLegadoWebApi } from '@/lib/web-api/dispatch';

vi.mock('@/lib/database/replace-rules', () => ({
  getAllReplaceRules: vi.fn(async () => [
    {
      id: 1,
      name: '测试',
      pattern: 'a',
      replacement: 'b',
      scopeTitle: false,
      scopeContent: true,
      isEnabled: true,
      isRegex: false,
      timeoutMillisecond: 3000,
      order: 1,
    },
  ]),
  insertReplaceRule: vi.fn(async () => 2),
  updateReplaceRule: vi.fn(async () => undefined),
  deleteReplaceRule: vi.fn(async () => undefined),
}));

vi.mock('@/lib/book-source/content-processor', () => ({
  invalidateReplaceRulesCache: vi.fn(),
}));

vi.mock('@/lib/replace-rules/test-replace-rule', () => ({
  testReplaceRule: vi.fn(async (_rule, text: string) => text.replace(/a/g, 'b')),
}));

describe('dispatchLegadoWebApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /getReplaceRules returns JSON rules', async () => {
    const res = await dispatchLegadoWebApi({ path: '/getReplaceRules', method: 'GET' });
    expect(res.kind).toBe('json');
    if (res.kind !== 'json') return;
    expect(res.payload.isSuccess).toBe(true);
    expect(typeof res.payload.data).toBe('string');
    expect(String(res.payload.data)).toContain('测试');
  });

  it('OPTIONS preflight returns success', async () => {
    const res = await dispatchLegadoWebApi({ path: '/getReplaceRules', method: 'OPTIONS' });
    expect(res.kind).toBe('json');
    if (res.kind !== 'json') return;
    expect(res.payload.isSuccess).toBe(true);
  });

  it('POST /testReplaceRule applies rule', async () => {
    const res = await dispatchLegadoWebApi({
      path: '/testReplaceRule',
      method: 'POST',
      body: JSON.stringify({
        rule: { name: 't', pattern: 'a', replacement: 'b', isRegex: false },
        text: 'aba',
      }),
    });
    expect(res.kind).toBe('json');
    if (res.kind !== 'json') return;
    expect(res.payload.isSuccess).toBe(true);
    expect(res.payload.data).toBe('bbb');
  });
});
