import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource } from '@/types';
import { patchLegadoLoginUrlScript } from '@/lib/js-engine/legado/login-script-patches';
import { syncControlSettingsToSourceArgs } from '@/lib/js-engine/legado/login-script-runner';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';

function loadQingtianLoginUrl(): string {
  const file = path.join(process.cwd(), 'examples', '晴天聚合.json');
  const j = JSON.parse(readFileSync(file, 'utf8')) as BookSource[] | BookSource;
  const s = Array.isArray(j) ? j[0]! : j;
  return s.loginUrl ?? '';
}

describe('qingtian server vs controlUrl', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('登录脚本补丁：control 已有 server 时跳过 health 全表扫描', () => {
    const raw = loadQingtianLoginUrl();
    expect(raw).toContain('function control()');
    const patched = patchLegadoLoginUrlScript(raw);
    expect(patched).toContain('__readerServer = getArgument');
    expect(patched).toContain(
      "if (__readerServer && String(__readerServer).indexOf('http') >= 0)",
    );
    expect(patched).toContain('__readerDeadline = Date.now() + 8000');
    expect(patched).not.toMatch(
      /setArgument\('server',\s*nextServer\);\s*setArgument\('controlUrl',\s*nextServer\);/,
    );
  });

  it('control 页 Cookie 回写 server 时不改写 controlUrl', () => {
    const source = {
      bookSourceUrl: '晴天融合VIP4.0',
      sourceUrl: '晴天融合VIP4.0',
    } as BookSource;
    const argsKey = getSourceArgsKey(source);
    ls.set(
      argsKey,
      JSON.stringify({
        server: 'https://v1.gyks.cf',
        controlUrl: 'https://v1.gyks.cf',
        tab: '小说',
      }),
    );

    syncControlSettingsToSourceArgs(
      source,
      'server=https://v2.gyks.cf; tab=听书; proxy=云端',
    );

    const saved = JSON.parse(ls.get(argsKey)!) as Record<string, string>;
    expect(saved.server).toBe('https://v2.gyks.cf');
    expect(saved.controlUrl).toBe('https://v1.gyks.cf');
    expect(saved.tab).toBe('听书');
  });
});
